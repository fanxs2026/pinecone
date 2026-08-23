import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// localePrefix: 'never' 下行为与 next/link、next/navigation 一致，
// 引入仅为需要 locale 感知导航时的可选便利。
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
