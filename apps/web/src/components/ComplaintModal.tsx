export type ComplaintBrowserBootstrap = {
  cookies: string;
  viewstate: string;
  eventvalidation: string;
};

function readHiddenInputValue(id: string) {
  const element = document.getElementById(id) as HTMLInputElement | null;
  return String(element?.value ?? "").trim();
}

export function collectComplaintBrowserBootstrap(): ComplaintBrowserBootstrap {
  return {
    cookies: String(document.cookie ?? "").trim(),
    viewstate: readHiddenInputValue("__VIEWSTATE"),
    eventvalidation: readHiddenInputValue("__EVENTVALIDATION"),
  };
}
