"""Acceptance tests against the supplied synthetic case originals, not mocks."""
import hashlib
import json
from pathlib import Path

import pytest

from api.knowledge.models import CitationArg, ListArgs, Principal, SearchArgs
from api.knowledge.seed import import_case_sources
from api.knowledge.service import KnowledgeService


@pytest.fixture
def case(tmp_path):
    service = KnowledgeService(tmp_path, tmp_path / 'documents.sqlite3')
    import_case_sources(service)
    return service, Principal(id='case-reader')


def test_original_bytes_and_idempotent_import(case):
    service, reader = case
    manifest = json.loads(Path('api/knowledge/sources/manifest.json').read_text())
    import_case_sources(service)
    catalog = service.list_knowledge_documents(reader, ListArgs())
    assert catalog.total == 3
    for document in catalog.items:
        entry = next(item for item in manifest if item['id'] == document.id)
        assert document.materialNature == 'synthetic'
        assert document.latestVersion.status == 'unverified'
        assert document.latestVersion.effectiveFrom is None
        assert document.latestVersion.versionLabel is None
        path, _, _ = service.original(reader, document.latestVersion.id)
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
        assert service.list_knowledge_versions(reader, document.id).total == 1


def test_case_document_search_and_instruction_structure(case):
    service, reader = case
    found = service.search_knowledge(reader, SearchArgs(q='Инструкция по документообороту'))
    assert any('Инструкция' in hit.citation.title for hit in found.items)
    instruction = next(document for document in service.list_knowledge_documents(reader, ListArgs()).items if document.category == 'instruction')
    assert instruction.latestVersion.pageCount == 51
    sections = service.sections(reader, instruction.latestVersion.id).items
    # Rotated watermark must not swallow clause 1.3 or fabricate a point 56
    # from a line-wrapped registration number ИТ-56.
    assert any(point.sectionNumber == '1.3' for point in sections)
    assert any(point.sectionNumber == '9.16' for point in sections)
    assert not any(point.sectionNumber == '56' for point in sections)
    appendix = next(point for point in sections if point.heading == 'Приложение № 1')
    assert appendix.parentId is None and appendix.pageStart == 51
    point = next(point for point in sections if point.sectionNumber == '1.3')
    full = service.get_knowledge_section(reader, point.id)
    assert full.pageStart == full.pageEnd == 2
    assert 'ДЕЙСТВУЮЩИМ' not in full.text


def test_real_guidance_point_21_and_verification_chain(case):
    service, reader = case
    result = service.search_knowledge(reader, SearchArgs(q='Когда присваивается регистрационный номер проекту распоряжения?'))
    first = result.items[0]
    assert first.section.sectionNumber == '2.1'
    assert 'Методические' in first.citation.title
    point = service.get_knowledge_section(reader, first.section.id)
    assert 'до его подписания и направления на регистрацию не присваивается' in point.text
    verified = service.verify_citation(reader, CitationArg(documentId=first.citation.documentId, versionId=first.citation.versionId, sectionId=point.id, excerpt=first.citation.excerpt))
    assert verified.verified


def test_real_matrix_row_6_required_and_conditional(case):
    service, reader = case
    result = service.search_knowledge(reader, SearchArgs(q='Кто должен визировать распоряжение о создании рабочей группы для ИТ-проекта?'))
    first = result.items[0]
    assert first.section.sectionNumber == '6'
    assert 'ВНУТРЕННИЕ ДОКУМЕНТЫ' in first.citation.locator
    point = service.get_knowledge_section(reader, first.section.id)
    assert 'Юридическое подразделение : Нет' in point.text
    assert 'Департамент ДОУ: Да' in point.text
    assert 'Кадровое подразделение: Да' in point.text
    assert 'Департамент информационных технологий визирует проект, если' in point.text
    assert point.table[0][1].strip() == 'Юридическое подразделение'
    assert service.search_knowledge(reader, SearchArgs(q='квазикристаллическая телепортация')).total == 0


def test_numbered_list_stays_inside_real_point_42(case):
    service, reader = case
    guidance = next(document for document in service.list_knowledge_documents(reader, ListArgs()).items if document.category == 'guidance')
    rows = service.sections(reader, guidance.latestVersion.id).items
    point = next(row for row in rows if row.sectionNumber == '4.2')
    full = service.get_knowledge_section(reader, point.id)
    assert '1. ответственный исполнитель' in full.text
    assert '3. корректор' in full.text
    assert '4. Департамент ДОУ' in full.text
    children = [row for row in rows if row.parentId == point.id]
    # The original skips item 2. Preserve this, never repair normative content.
    assert [row.sectionNumber for row in children] == ['1', '3', '4']
    next_point = next(row for row in rows if row.sectionNumber == '4.3')
    assert next_point.parentId == point.parentId
