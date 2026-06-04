import { describe, it, assert } from "vitest";
import { parse_config } from "../../../../src/core_layer/data/parse/config_parser.js";

describe("parse_config", () => {
  it("should parse dev config correctly", () => {
    const config = parse_config("dev");
    assert.equal(config.app.name, "Claude Code Binary Tree");
    assert.equal(config.app.version, "1.0.0");
    assert.equal(config.app.debug, true);
  });

  it("should parse test config correctly", () => {
    const config = parse_config("test");
    assert.equal(config.server.port, 9090);
  });

  it("should parse prod config correctly", () => {
    const config = parse_config("prod");
    assert.equal(config.app.debug, false);
  });
});
