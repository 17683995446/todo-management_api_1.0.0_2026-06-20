import type { Logger } from '../../core_layer/logic/logger.js'
import { StateTransitionError } from '../../core_layer/model/errors.js'
import type { ILifecycleManager } from '../agent.interface.js'
import type {
  LifecycleEventType,
  LifecycleSnapshot,
  LifecycleState,
  StateTransition,
} from '../model/lifecycle.js'
import { VALID_TRANSITIONS, isValidTransition } from '../model/lifecycle.js'

/**
 * 事件到目标状态的映射
 */
const EVENT_TO_STATE: Record<LifecycleEventType, LifecycleState> = {
  initialize: 'initializing',
  ready: 'ready',
  start: 'running',
  pause: 'paused',
  resume: 'running',
  drain: 'draining',
  recover: 'recovering',
  fail: 'failed',
  stop: 'stopped',
}

/**
 * 生命周期管理器
 *
 * 管理 Agent 的正式状态机，约束状态转换。
 *
 * 设计原则：
 * - 状态机有明确的合法转换路径（VALID_TRANSITIONS）
 * - 非法转换抛出错误，确保行为可预测
 * - 每次转换记录到历史，支持审计
 * - 跟踪运行时长、暂停时长、循环次数
 * - canExecute() 判断当前是否可执行循环
 *
 * 这是秩序化的行为契约：Agent 状态可预测、可管理。
 */
export class LifecycleManager implements ILifecycleManager {
  private currentState: LifecycleState = 'initializing'
  private previousState: LifecycleState | undefined
  private enteredAt: number = Date.now()
  private readonly transitionHistory: StateTransition[] = []
  private totalUptimeMs = 0
  private totalPausedMs = 0
  private cycleCount = 0
  private lastStateChangeTime: number = Date.now()

  constructor(private readonly logger: Logger) {
    this.logger.info('Lifecycle manager initialized', {
      state: this.currentState,
    })
  }

  getState(): LifecycleState {
    return this.currentState
  }

  getSnapshot(): LifecycleSnapshot {
    const now = Date.now()
    const timeInCurrentState = now - this.enteredAt

    // 累加当前状态的时长
    let uptime = this.totalUptimeMs
    let paused = this.totalPausedMs
    if (this.currentState === 'running') {
      uptime += timeInCurrentState
    } else if (this.currentState === 'paused') {
      paused += timeInCurrentState
    }

    return {
      currentState: this.currentState,
      previousState: this.previousState,
      enteredAt: new Date(this.enteredAt).toISOString(),
      transitionHistory: [...this.transitionHistory],
      totalUptimeMs: uptime,
      totalPausedMs: paused,
      cycleCount: this.cycleCount,
    }
  }

  transition(event: LifecycleEventType, reason?: string): StateTransition {
    const targetState = EVENT_TO_STATE[event]

    if (!this.canTransition(targetState)) {
      this.logger.error('Invalid lifecycle transition', {
        from: this.currentState,
        to: targetState,
        event,
        reason,
      })
      throw new StateTransitionError(this.currentState, targetState, {
        event,
        reason,
      })
    }

    // 累加当前状态的时长
    const now = Date.now()
    const timeInState = now - this.lastStateChangeTime
    if (this.currentState === 'running') {
      this.totalUptimeMs += timeInState
    } else if (this.currentState === 'paused') {
      this.totalPausedMs += timeInState
    }

    const transition: StateTransition = {
      from: this.currentState,
      to: targetState,
      event,
      timestamp: new Date(now).toISOString(),
      reason,
    }

    this.previousState = this.currentState
    this.currentState = targetState
    this.enteredAt = now
    this.lastStateChangeTime = now
    this.transitionHistory.push(transition)

    this.logger.info('Lifecycle transition', {
      from: transition.from,
      to: transition.to,
      event,
      reason,
    })

    return transition
  }

  canTransition(to: LifecycleState): boolean {
    return isValidTransition(this.currentState, to)
  }

  isRunning(): boolean {
    return this.currentState === 'running'
  }

  canExecute(): boolean {
    return this.currentState === 'running' || this.currentState === 'draining'
  }

  recordCycle(): void {
    this.cycleCount++
  }

  getHistory(): StateTransition[] {
    return [...this.transitionHistory]
  }

  /**
   * 获取合法的下一个状态列表
   */
  getValidNextStates(): LifecycleState[] {
    return VALID_TRANSITIONS[this.currentState]
  }
}
