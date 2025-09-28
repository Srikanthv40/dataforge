/**
 * Load text content from a file path
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} File content as string
 */
export async function loadtxt(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${filePath}`);
    }
    return await response.text();
  } catch (error) {
    throw new Error(`Error loading text file ${filePath}: ${error.message}`);
  }
}