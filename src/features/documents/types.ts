export interface FieldSpec { key: string; label: string; section: string; required: boolean; multiline: boolean; inputType: 'text' | 'date' | 'select'; options: string[] }
export interface DocumentTemplate { templateId: string; title: string; kind: string; templateVersion: string | null; sourceStatus: 'awaiting_source' | 'awaiting_review' | 'awaiting_schema' | 'ready'; registryStatus: 'unverified'; sourceFilename: string | null; sourceSha256: string | null; fields: FieldSpec[]; note: string }
export interface ValidationIssue { code: string; field: string | null; message: string }
export interface Validation { ready: boolean; completed: number; total: number; issues: ValidationIssue[] }
export interface DocumentArtifact { artifactId: string; projectVersion: number; createdAt: string; filename: string; sha256: string }
export interface DocumentProject { projectId: string; templateId: string; templateVersion: string | null; title: string; fields: Record<string, string>; status: 'draft' | 'generated'; version: number; createdAt: string; updatedAt: string; sourceStatus: string; validation: Validation; artifacts: DocumentArtifact[]; preview: {section: string; label: string; value: string}[] }
export interface Session { deviceId: string; csrfToken: string }
