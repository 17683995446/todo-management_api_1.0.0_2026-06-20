import { z } from 'zod'
import { PRIORITY_ORDER } from '../../../../core_layer/model/todo.js'

/**
 * 更新 Todo 的请求体验证 Schema
 */
export const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
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
      .transform(v => (v ? Array.from(new Set(v)) : v))
  })
  .refine(data => Object.keys(data).length > 0, { message: '至少需要提供一个字段' })

/**
 * 更新 Todo 的请求体类型
 */
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
