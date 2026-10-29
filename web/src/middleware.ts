import { defineMiddleware } from 'astro:middleware';
import { adapter } from '@/lib/context';

// Wraps the whole render, so every await inside components still sees this request's context.
export const onRequest = defineMiddleware((_context, next) => adapter.run(() => next()));
