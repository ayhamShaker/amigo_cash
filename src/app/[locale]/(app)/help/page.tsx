import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { getSettings } from "@/server/settings";
import { FaqList } from "@/components/faq";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Help") };
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { t } = await pageLocale(params);
  const settings = await getSettings();
  return (
    <>
      <div className="pagehead">
        <h1>{t("Help centre")}</h1>
        <span className="small muted">
          {t("Email us at")}{" "}
          <a href={`mailto:${settings.supportEmail}`} dir="ltr" style={{ color: "var(--accent)", fontWeight: 700 }}>
            {settings.supportEmail}
          </a>
        </span>
      </div>
      <div className="split">
        <div className="faq card" style={{ paddingBlock: 4 }}>
          <FaqList t={t} settings={settings} />
        </div>
        <div className="card stack">
          <span className="iconcircle">
            <Icon name="chat" />
          </span>
          <h3 style={{ fontSize: 18 }}>{t("Talk to a person")}</h3>
          <p className="small muted">{t("Our team answers in the live chat, usually within a couple of minutes. If you close the page, the reply also arrives by email.")}</p>
          <p className="small">{t("Use the blue chat button at the bottom of the screen.")}</p>
        </div>
      </div>
    </>
  );
}
