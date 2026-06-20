import { z } from 'zod'
import { PRIORITY_ORDER } from '../../../../core_layer/model/todo.js'

/**
 * 创建 Todo 的请求体验证 Schema
 */
export const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  completed: z.boolean().optional(),
  priority: z.enum(PRIORITY_ORDER as unknown as [string, ...string[]]).optional(),
  dueDate: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  tags: z
    .array(z.string().trim().min(1).max(50))
    .max(20)
    .optional()
    .transform(v => (v ? Array.from(new Set(v)) : []))
})

/**
 * 创建 Todo 的请求体类型
 */
export type CreateTodoInput = z.infer<typeof createTodoSchema>
