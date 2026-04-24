from .registry import registry
from .file_reader import FileReaderTool
from .python_executor import PythonExecutorTool
from .rag_search import RagSearchTool
from .web_search import WebSearchTool

registry.register_tool(FileReaderTool())
registry.register_tool(PythonExecutorTool())
registry.register_tool(RagSearchTool())
registry.register_tool(WebSearchTool())
