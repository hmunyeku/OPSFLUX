from app.mcp.mcp_native import NativeBackend, NativeToolContext
from app.mcp.opsflux_tools import _resolve_tool_permissions, _tool_visible_for_context


def test_opsflux_tool_permission_mapping_covers_main_business_tools():
    assert _resolve_tool_permissions("list_projects") == ["project.read"]
    assert _resolve_tool_permissions("create_project") == ["project.create"]
    assert _resolve_tool_permissions("list_ads") == ["paxlog.ads.read"]
    assert _resolve_tool_permissions("list_voyages") == ["travelwiz.voyage.read"]
    assert _resolve_tool_permissions("list_settings") == ["core.settings.manage"]


def test_opsflux_tool_visibility_is_hidden_when_permission_missing():
    context = NativeToolContext(permissions={"project.read"})
    assert _tool_visible_for_context("list_projects", context) is True
    assert _tool_visible_for_context("create_project", context) is False
    assert _tool_visible_for_context("list_settings", context) is False


async def test_native_backend_respects_context_filtered_tools():
    async def call_tool(name: str, arguments: dict) -> dict:
        return {"name": name, "arguments": arguments}

    async def list_tools_for_context(context: NativeToolContext | None):
        if context is None:
            return [{"name": "visible"}, {"name": "hidden"}]
        return [{"name": "visible"}]

    async def call_tool_with_context(name: str, arguments: dict, context: NativeToolContext | None):
        if context is not None and name == "hidden":
            raise ValueError("Outil non autorisé: hidden")
        return await call_tool(name, arguments)

    backend = NativeBackend(
        name="test",
        version="1.0.0",
        tools_list=[{"name": "visible"}, {"name": "hidden"}],
        call_tool=call_tool,
        list_tools_fn=list_tools_for_context,
        call_tool_with_context=call_tool_with_context,
    )

    context = NativeToolContext(permissions={"project.read"})
    tools = await backend.list_tools(context)
    assert tools == [{"name": "visible"}]

    result = await backend.execute_tool("visible", {"ok": True}, context)
    assert result == {"name": "visible", "arguments": {"ok": True}}
