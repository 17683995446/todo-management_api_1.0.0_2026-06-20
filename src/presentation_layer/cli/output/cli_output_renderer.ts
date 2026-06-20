import { BaseOutputRenderer } from './base_output_renderer.js'

export class CliOutputRenderer extends BaseOutputRenderer {
  async render(data: unknown): Promise<void> {
    if (typeof data === 'string') {
      console.log(data)
    } else {
      console.log(JSON.stringify(data, null, 2))
    }
  }
}
