import { marked } from 'marked'

export const renderDescription = async (
  container: HTMLElement,
  markdown: string
): Promise<void> => {
  container.innerHTML = await marked.parse(markdown)
}
