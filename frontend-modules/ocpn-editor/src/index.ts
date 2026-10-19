import { defineModule, defineModuleRoute } from "@ocelescope/core";
import { PencilRuler } from "lucide-react";
import Editor from "./routes/main";

export const PnEditor = defineModuleRoute({
  component: Editor,
  label: "Petri-Net Editor",
  name: "Petri-Net Editor",
  requiresOcel: false,
});

export default defineModule({
  name: "ocpnEditor",
  label: "Petri-Net Editor",
  description: "An Petri-Net Editor",
  authors: [{ name: "Uy Sa Huynh" }],
  icon: PencilRuler,
  routes: [PnEditor],
});
