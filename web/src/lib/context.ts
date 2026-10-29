import { AsyncLocalStorage } from 'node:async_hooks';
import { configureAdapter, MemoryAdapter } from '@optimizely/cms-sdk/core';

export const adapter = new MemoryAdapter(new AsyncLocalStorage());
configureAdapter(adapter);
