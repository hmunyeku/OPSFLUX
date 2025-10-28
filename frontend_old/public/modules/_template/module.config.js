// ../modules/_template/frontend/module.config.ts
var MyModule = {
  config: {
    code: "[MODULE_CODE]",
    // Ex: "inventory-management"
    name: "[MODULE_NAME]",
    // Ex: "Inventory Management"
    version: "1.0.0",
    description: "Description de votre module",
    author: "Votre Nom",
    dependencies: []
    // Autres modules requis: ["third-parties", "users"]
  },
  // Widgets fournis par le module
  // Décommentez et importez vos widgets depuis widgets/registry.ts
  // widgets: MY_WIDGETS,
  widgets: [],
  // Routes du module (optionnel)
  routes: [
    // Exemple de route personnalisée
    // {
    //   path: "/[MODULE_CODE]/dashboard",
    //   component: MyDashboard,
    //   name: "Mon Dashboard",
    //   icon: "layout-dashboard",
    //   order: 10,
    //   requireAuth: true,
    // }
  ],
  // Hook d'initialisation (optionnel)
  // Appelé lors du chargement du module
  onInit: async () => {
    console.log(`\u{1F4E6} [MODULE_NAME] module initialized`);
  },
  // Hook de nettoyage (optionnel)
  // Appelé lors du déchargement du module
  onDestroy: async () => {
    console.log(`\u{1F4E6} [MODULE_NAME] module destroyed`);
  }
};
var module_config_default = MyModule;
export {
  MyModule,
  module_config_default as default
};
