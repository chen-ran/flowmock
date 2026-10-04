import { createTranslation } from './translation.tsx';

// The controls' own instance of the boundary: it knows the ui namespace and
// nothing an app adds, so a control cannot come to depend on an app's string.
export const { useTranslation: useUiTranslation, Trans: UiTrans } = createTranslation();
