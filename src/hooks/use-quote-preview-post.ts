import { createContext, useContext, type ReactNode } from 'react';
import type { PostProps } from '../lib/utils/post-props';

// Quote previews (reply-quote-preview, markdown/external-number-quote-link) render a Post on
// hover, and Post's own tree renders those previews. The nearest Post (or the app root) supplies
// a render function through context so components/post -> post-desktop -> comment-content ->
// markdown -> reply-quote-preview stays acyclic without a lazy import. It is a function rather
// than a component type so consumers never render a dynamic element type.
export type RenderQuotePreviewPost = (props: PostProps) => ReactNode;

export const QuotePreviewPostContext = createContext<RenderQuotePreviewPost | null>(null);

export const useQuotePreviewPost = () => useContext(QuotePreviewPostContext);
