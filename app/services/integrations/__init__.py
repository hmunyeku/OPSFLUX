"""External integration services (GitHub, Dokploy, Agent runners).

Each submodule exposes:
  * `test_connection(config, credentials) -> (ok, message, details)`
  * Higher-level helpers used by the agent harness (created in Sprint 3+)
"""
