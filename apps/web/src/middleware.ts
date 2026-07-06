import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Автоопределение языка по браузеру (Accept-Language) при первом входе и
// сохранение выбора в cookie выполняет next-intl middleware.
export default createMiddleware(routing);

export const config = {
  // Все пути, кроме статики, api и внутренних файлов Next.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
