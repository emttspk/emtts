export async function htmlToPdfBuffer(html, browser, format = "A4") {
    const renderOnce = async () => {
        const page = await browser.newPage();
        try {
            await page.setContent(html, { waitUntil: "networkidle0" });
            return await page.pdf({
                format: format === "A4" ? "A4" : undefined,
                width: format === "4x6" ? "4in" : format === "envelope-9x4" ? "9in" : undefined,
                height: format === "4x6" ? "6in" : format === "envelope-9x4" ? "4in" : undefined,
                printBackground: true,
                preferCSSPageSize: format === "A4",
            });
        }
        finally {
            await page.close();
        }
    };
    try {
        return await renderOnce();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        if (!message.toLowerCase().includes("frame was detached")) {
            throw err;
        }
        console.warn("[PDF] Retrying render after detached frame...");
        return await renderOnce();
    }
}
