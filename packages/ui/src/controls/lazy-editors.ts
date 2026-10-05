import { lazy } from 'react';

// Monaco is the largest thing an app can load, and it is worth its size only to
// the surfaces that show an editor, so the editors are reached through these and
// rendered under a Suspense boundary of the caller's choosing. Importing
// ./body-editor.tsx or ./yaml-editor.tsx directly pulls Monaco into whatever
// chunk the importer lands in.
export const LazyBodyEditor = lazy(async () => await import('./body-editor.tsx'));
export const LazyYamlEditor = lazy(async () => await import('./yaml-editor.tsx'));
