import type { SqliteEntityConfig } from '../../core_layer/data/access/sqlite_repository.js'
import type { Learning, LearningType } from './learning.js'

const VALID_TYPES: LearningType[] = [
  'pattern',
  'rule_update',
  'skill_acquisition',
  'performance',
]

/**
 * Learning 的 SQLite 映射配置
 */
export const learningSqliteConfig: SqliteEntityConfig<Learning> = {
  tableName: 'agent_learnings',
  columns: [
    { name: 'type', type: 'TEXT' },
    { name: 'pattern', type: 'TEXT' },
    { name: 'context', type: 'TEXT' },
    { name: 'confidence', type: 'REAL' },
    { name: 'occurrences', type: 'INTEGER' },
    { name: 'sourceAction', type: 'TEXT', nullable: true },
    { name: 'suggestedRuleUpdate', type: 'TEXT', nullable: true },
    { name: 'applied', type: 'BOOLEAN' },
    { name: 'appliedAt', type: 'TEXT', nullable: true },
  ],
  fromRow: (row: Record<string, unknown>): Learning => {
    const type = VALID_TYPES.includes(row.type as LearningType)
      ? (row.type as LearningType)
      : 'pattern'

    return {
      id: row.id as string,
      type,
      pattern: row.pattern as string,
      context: row.context as string,
      confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
      occurrences: typeof row.occurrences === 'number' ? row.occurrences : 1,
      sourceAction: (row.sourceAction as string) || undefined,
      suggestedRuleUpdate: (row.suggestedRuleUpdate as string) || undefined,
      applied: Boolean(row.applied),
      appliedAt: (row.appliedAt as string) || undefined,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  },
  toValues: (
    entity: Partial<Omit<Learning, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.type !== undefined) values.type = entity.type
    if (entity.pattern !== undefined) values.pattern = entity.pattern
    if (entity.context !== undefined) values.context = entity.context
    if (entity.confidence !== undefined) values.confidence = entity.confidence
    if (entity.occurrences !== undefined)
      values.occurrences = entity.occurrences
    if (entity.sourceAction !== undefined)
      values.sourceAction = entity.sourceAction
    if (entity.suggestedRuleUpdate !== undefined)
      values.suggestedRuleUpdate = entity.suggestedRuleUpdate
    if (entity.applied !== undefined) values.applied = entity.applied ? 1 : 0
    if (entity.appliedAt !== undefined) values.appliedAt = entity.appliedAt
    return values
  },
}
