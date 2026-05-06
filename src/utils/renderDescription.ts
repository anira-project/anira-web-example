import { marked } from 'marked'

const DOCS_URL =
  import.meta.env.VITE_DOCS_URL || 'https://anira-project.github.io/anira'

/**
 * Renders a raw markdown string into the given container element.
 *
 * Substitutes the literal string `$DOCS_URL` with the
 * `VITE_DOCS_URL` env variable (defaulting to the published anira
 * docs) so links work against either the production docs or a local
 * sphinx build.
 */
export const renderDescription = async (
  container: HTMLElement,
  markdown: string
): Promise<void> => {
  const interpolated = markdown.replaceAll('$DOCS_URL', DOCS_URL)
  container.innerHTML = await marked.parse(interpolated)
}
