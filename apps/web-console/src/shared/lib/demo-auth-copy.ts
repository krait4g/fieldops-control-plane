import type { Locale } from "./copy";

interface DemoAuthCopy {
  fixtureTitle: string;
  fixtureIntro: string;
  switchUser: string;
}

export const demoAuthCopy: Record<Locale, DemoAuthCopy> = {
  ko: {
    fixtureTitle: "데모 사용자 선택",
    fixtureIntro: "권한별 화면을 확인할 Synthetic 세션을 선택하세요.",
    switchUser: "데모 사용자 변경",
  },
  en: {
    fixtureTitle: "Choose a demo user",
    fixtureIntro: "Choose a synthetic session to review role-specific views.",
    switchUser: "Switch demo user",
  },
};
