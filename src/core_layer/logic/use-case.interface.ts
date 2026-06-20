/**
 * 基础用例接口
 * @typeParam I - 输入类型
 * @typeParam O - 输出类型
 */
export interface IUseCase<I, O> {
  /**
   * 执行用例
   * @param input - 输入数据
   * @returns 执行结果
   */
  execute(input: I): Promise<O>
}

/**
 * 可验证的用例接口
 * @typeParam I - 输入类型
 * @typeParam O - 输出类型
 */
export interface IValidatedUseCase<I, O> extends IUseCase<I, O> {
  /**
   * 验证输入数据
   * @param input - 输入数据
   * @returns 验证是否通过
   */
  validate(input: I): Promise<boolean>
}

/**
 * 可取消的用例接口
 * @typeParam I - 输入类型
 * @typeParam O - 输出类型
 */
export interface ICancellableUseCase<I, O> extends IUseCase<I, O> {
  /**
   * 取消执行中的用例
   */
  cancel(): Promise<void>

  /**
   * 检查用例是否正在执行
   * @returns 是否正在执行
   */
  isRunning(): boolean
}
