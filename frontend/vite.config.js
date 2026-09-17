import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
            },
            {
              name: "icons-vendor",
              test: /node_modules[\\/]lucide-react[\\/]/,
            },
            {
              name: "charts-vendor",
              test: /node_modules[\\/]recharts[\\/]/,
            },
            {
              name: "excel-vendor",
              test: /node_modules[\\/]xlsx[\\/]/,
            },
          ],
        },
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
              return "react-vendor";
            }
            if (id.includes("lucide-react")) {
              return "icons-vendor";
            }
            if (id.includes("recharts")) {
              return "charts-vendor";
            }
            if (id.includes("xlsx")) {
              return "excel-vendor";
            }
          }
        },
      },
    },
  },
});
