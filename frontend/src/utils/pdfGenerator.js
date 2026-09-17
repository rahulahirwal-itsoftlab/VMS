import { toast } from "sonner";

/**
 * Directly generates and downloads a PDF from HTML content without popups.
 * @param {Object} options
 * @param {string} options.htmlContent - HTML markup string
 * @param {string} options.filename - Target PDF filename
 * @param {string} [options.documentTitle] - Human readable title for toast notifications
 * @returns {Promise<void>}
 */
export const downloadHtmlAsPdf = async ({ htmlContent, filename, documentTitle = "Document" }) => {
  const toastId = toast.loading(`Generating ${documentTitle} PDF...`);

  try {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.top = "-9999px";
    container.style.left = "-9999px";
    container.style.width = "850px";
    container.style.background = "#ffffff";
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Wait for the browser to recalculate styles, reflow, and paint the newly appended element
    await new Promise((resolve) => setTimeout(resolve, 150));

    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    toast.loading(`Downloading ${documentTitle}...`, { id: toastId });

    const { default: html2pdf } = await import("html2pdf.js/src/index.js");
    await html2pdf().from(container).set(opt).save();

    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }

    toast.success(`${documentTitle} Download Complete`, { id: toastId });
  } catch (error) {
    console.error("PDF Generation error:", error);
    let errorMsg = "Unable to generate PDF.";
    if (error?.response?.status === 403 || error?.status === 403) {
      errorMsg = "Permission denied. You do not have permission to download this document.";
    } else if (error?.response?.status === 404 || error?.status === 404) {
      errorMsg = "Document not found.";
    }
    toast.error(errorMsg, { id: toastId });
    throw error;
  }
};
