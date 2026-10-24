"""Allowlisted adapter over existing tools; no SQL, paths, or model-supplied roles."""
from fastapi import HTTPException


class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, definitions, handler):
        for definition in definitions:
            name = definition['name']
            if name in self._tools:
                raise ValueError(f'duplicate_tool: {name}')
            # All tools have one canonical invocation path and retain service metadata.
            self._tools[name] = ({**definition, 'method': 'POST', 'path': f'/api/tools/{name}/invoke'}, handler)

    def definitions(self):
        return [definition for definition, _ in self._tools.values()]

    def invoke(self, name, arguments, user):
        if name not in self._tools:
            raise HTTPException(404, 'tool_not_found')
        return self._tools[name][1](name, arguments, user)
