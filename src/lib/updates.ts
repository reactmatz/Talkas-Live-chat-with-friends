import { useEffect, useState } from "react";
import { native, type UpdateState } from "./native";
import { t } from "./i18n";

export const DOWNLOAD_PAGE = "https://github.com/reactmatz/Talkas-Live-chat-with-friends/releases/latest";

/** Live updater state from the main process (null in a plain browser). */
export function useUpdate() {
  const [s, setS] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!native) return;
    void native.update.state().then(setS);
    return native.update.onState(setS);
  }, []);
  return s;
}

export function updateErrorText(message: string) {
  if (message === "update-feed-unreachable") return t("Couldn't reach the update page. The releases may be private — download the new version manually.");
  if (message === "offline") return t("No internet connection.");
  return message;
}
