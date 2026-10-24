import { expect, test } from '@playwright/test'
import { knowledgeHash, readKnowledgeTarget } from '../../src/features/knowledge/routing'
test('old document and section links preserve edition and tabs without rewriting section identity', () => {
  expect(readKnowledgeTarget('#knowledge/documents/doc-id')).toEqual({documentId:'doc-id',versionId:undefined,tab:'view'})
  expect(readKnowledgeTarget('#knowledge/sections/point-id?tab=info')).toEqual({sectionId:'point-id',versionId:undefined,tab:'info'})
  const target={documentId:'doc-id',versionId:'old-edition',tab:'contents' as const}
  expect(readKnowledgeTarget(knowledgeHash(target))).toEqual(target)
  expect(knowledgeHash({sectionId:'point-id',versionId:'ignored'})).toBe('#knowledge/sections/point-id')
  expect(readKnowledgeTarget('#knowledge?tab=unknown').tab).toBe('view')
})
