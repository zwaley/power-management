import os
from md2docx_python.src.md2docx_python import markdown_to_word

def convert_md_to_docx(md_file, docx_file):
    """
    Converts a Markdown file to a DOCX file.

    Args:
        md_file (str): The path to the input Markdown file.
        docx_file (str): The path to the output DOCX file.
    """
    try:
        markdown_to_word(md_file, docx_file)
        print(f"Successfully converted '{md_file}' to '{docx_file}'")
    except Exception as e:
        print(f"Error converting '{md_file}' to '{docx_file}': {e}")

if __name__ == "__main__":
    # Get the absolute path of the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Construct the absolute paths for the input and output files
    markdown_file_path = os.path.join(script_dir, "docs", "动力资源管理系统用户手册.md")
    docx_file_path = os.path.join(script_dir, "docs", "动力资源管理系统用户手册.docx")

    # Ensure the input file exists
    if not os.path.exists(markdown_file_path):
        print(f"Error: Markdown file not found at '{markdown_file_path}'")
    else:
        convert_md_to_docx(markdown_file_path, docx_file_path)