-- Seed dashboards and widgets
-- Run: docker exec -i opsflux-db-1 psql -U opsflux_user -d opsflux < scripts/seed_dashboards.sql

-- Check if dashboards already exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM dashboards LIMIT 1) THEN
        RAISE NOTICE 'Dashboards already seeded. Skipping.';
        RETURN;
    END IF;

    -- Dashboard 1: Vue d'ensemble Pilotage
    INSERT INTO dashboards (id, name, description, version, menu_parent, menu_label, menu_icon, menu_order, show_in_sidebar, is_home_page, is_public, auto_refresh, refresh_interval, enable_filters, enable_export, enable_fullscreen, is_template, is_archived, created_at, updated_at)
    VALUES (
        'a1000000-0000-0000-0000-000000000001',
        'Vue d''ensemble',
        'Dashboard principal avec KPIs et métriques clés',
        '1.0',
        'pilotage',
        'Vue d''ensemble',
        'LayoutDashboard',
        1,
        true,
        true,
        true,
        true,
        '1m',
        true,
        true,
        true,
        false,
        false,
        NOW(),
        NOW()
    );

    -- Widgets for Dashboard 1
    INSERT INTO dashboard_widgets (id, dashboard_id, name, widget_type, position_x, position_y, width, height, min_width, min_height, z_index, "order", data_source_type, data_source_config, widget_config, is_visible, is_resizable, is_draggable, is_removable, auto_refresh, refresh_interval, enable_cache, cache_ttl, created_at, updated_at) VALUES
    ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Personnel actif', 'stats_card', 0, 0, 3, 2, 1, 1, 0, 0, 'api', '{"endpoint": "/api/v1/stats/personnel"}', '{"title": "Personnel actif", "icon": "Users", "color": "blue"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Vols aujourd''hui', 'stats_card', 3, 0, 3, 2, 1, 1, 0, 1, 'api', '{"endpoint": "/api/v1/stats/flights"}', '{"title": "Vols aujourd''hui", "icon": "Plane", "color": "green"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Cargo en transit', 'stats_card', 6, 0, 3, 2, 1, 1, 0, 2, 'api', '{"endpoint": "/api/v1/stats/cargo"}', '{"title": "Cargo en transit", "icon": "Package", "color": "orange"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Alertes', 'stats_card', 9, 0, 3, 2, 1, 1, 0, 3, 'api', '{"endpoint": "/api/v1/stats/alerts"}', '{"title": "Alertes", "icon": "AlertTriangle", "color": "red"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Activité hebdomadaire', 'line_chart', 0, 2, 8, 4, 1, 1, 0, 4, 'api', '{"endpoint": "/api/v1/stats/weekly"}', '{"title": "Activité hebdomadaire"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'Activité récente', 'list', 8, 2, 4, 4, 1, 1, 0, 5, 'api', '{"endpoint": "/api/v1/activity"}', '{"title": "Activité récente", "limit": 10}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW());

    -- Dashboard 2: Logistique TravelWiz
    INSERT INTO dashboards (id, name, description, version, menu_parent, menu_label, menu_icon, menu_order, show_in_sidebar, is_public, auto_refresh, refresh_interval, enable_filters, enable_export, enable_fullscreen, is_template, is_archived, created_at, updated_at)
    VALUES (
        'a1000000-0000-0000-0000-000000000002',
        'Logistique & Rotations',
        'Suivi des rotations, manifests et cargo',
        '1.0',
        'travelwiz',
        'Logistique',
        'Truck',
        2,
        true,
        true,
        false,
        'manual',
        true,
        true,
        true,
        false,
        false,
        NOW(),
        NOW()
    );

    -- Widgets for Dashboard 2
    INSERT INTO dashboard_widgets (id, dashboard_id, name, widget_type, position_x, position_y, width, height, min_width, min_height, z_index, "order", data_source_type, data_source_config, widget_config, is_visible, is_resizable, is_draggable, is_removable, auto_refresh, refresh_interval, enable_cache, cache_ttl, created_at, updated_at) VALUES
    ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Manifests en cours', 'table', 0, 0, 12, 5, 1, 1, 0, 0, 'api', '{"endpoint": "/api/v1/manifests"}', '{"title": "Manifests en cours"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Cargo par destination', 'bar_chart', 0, 5, 6, 4, 1, 1, 0, 1, 'api', '{"endpoint": "/api/v1/stats/cargo-by-dest"}', '{"title": "Cargo par destination"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Occupation vols', 'pie_chart', 6, 5, 6, 4, 1, 1, 0, 2, 'api', '{"endpoint": "/api/v1/stats/flight-occupancy"}', '{"title": "Occupation vols"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW());

    -- Dashboard 3: Gestion Personnel POBVue
    INSERT INTO dashboards (id, name, description, version, menu_parent, menu_label, menu_icon, menu_order, show_in_sidebar, is_public, auto_refresh, refresh_interval, enable_filters, enable_export, enable_fullscreen, is_template, is_archived, created_at, updated_at)
    VALUES (
        'a1000000-0000-0000-0000-000000000003',
        'Gestion Personnel',
        'Personnel offshore et certifications',
        '1.0',
        'pobvue',
        'Personnel',
        'Users',
        1,
        true,
        true,
        false,
        'manual',
        true,
        true,
        true,
        false,
        false,
        NOW(),
        NOW()
    );

    -- Widgets for Dashboard 3
    INSERT INTO dashboard_widgets (id, dashboard_id, name, widget_type, position_x, position_y, width, height, min_width, min_height, z_index, "order", data_source_type, data_source_config, widget_config, is_visible, is_resizable, is_draggable, is_removable, auto_refresh, refresh_interval, enable_cache, cache_ttl, created_at, updated_at) VALUES
    ('b3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Personnel offshore', 'stats_card', 0, 0, 4, 2, 1, 1, 0, 0, 'api', '{"endpoint": "/api/v1/pob/stats/offshore"}', '{"title": "Personnel offshore", "icon": "Users"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 'Certifications expirées', 'stats_card', 4, 0, 4, 2, 1, 1, 0, 1, 'api', '{"endpoint": "/api/v1/pob/stats/certifications"}', '{"title": "Certifs expirées", "icon": "AlertCircle", "color": "red"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Répartition par site', 'pie_chart', 8, 0, 4, 4, 1, 1, 0, 2, 'api', '{"endpoint": "/api/v1/pob/stats/by-site"}', '{"title": "Répartition par site"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'Alertes certifications', 'table', 0, 2, 8, 4, 1, 1, 0, 3, 'api', '{"endpoint": "/api/v1/pob/certifications/expiring"}', '{"title": "Alertes certifications"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW());

    -- Dashboard 4: Suivi Projets
    INSERT INTO dashboards (id, name, description, version, menu_parent, menu_label, menu_icon, menu_order, show_in_sidebar, is_public, auto_refresh, refresh_interval, enable_filters, enable_export, enable_fullscreen, is_template, is_archived, created_at, updated_at)
    VALUES (
        'a1000000-0000-0000-0000-000000000004',
        'Suivi Projets',
        'Vue consolidée de l''avancement des projets',
        '1.0',
        'projects',
        'Suivi Projets',
        'FolderKanban',
        1,
        true,
        true,
        false,
        'manual',
        true,
        true,
        true,
        false,
        false,
        NOW(),
        NOW()
    );

    -- Widgets for Dashboard 4
    INSERT INTO dashboard_widgets (id, dashboard_id, name, widget_type, position_x, position_y, width, height, min_width, min_height, z_index, "order", data_source_type, data_source_config, widget_config, is_visible, is_resizable, is_draggable, is_removable, auto_refresh, refresh_interval, enable_cache, cache_ttl, created_at, updated_at) VALUES
    ('b4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'Projets en cours', 'stats_card', 0, 0, 3, 2, 1, 1, 0, 0, 'api', '{"endpoint": "/api/v1/projects/stats"}', '{"title": "Projets en cours", "icon": "FolderKanban"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'Tâches en retard', 'stats_card', 3, 0, 3, 2, 1, 1, 0, 1, 'api', '{"endpoint": "/api/v1/projects/tasks/overdue"}', '{"title": "Tâches en retard", "icon": "Clock", "color": "red"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004', 'Avancement projets', 'bar_chart', 0, 2, 6, 4, 1, 1, 0, 2, 'api', '{"endpoint": "/api/v1/projects/progress"}', '{"title": "Avancement projets"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'Activités récentes', 'list', 6, 0, 6, 6, 1, 1, 0, 3, 'api', '{"endpoint": "/api/v1/projects/activity"}', '{"title": "Activités récentes"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW());

    -- Dashboard 5: Tiers & Contacts
    INSERT INTO dashboards (id, name, description, version, menu_parent, menu_label, menu_icon, menu_order, show_in_sidebar, is_public, auto_refresh, refresh_interval, enable_filters, enable_export, enable_fullscreen, is_template, is_archived, created_at, updated_at)
    VALUES (
        'a1000000-0000-0000-0000-000000000005',
        'Annuaire Tiers',
        'Gestion des entreprises et contacts',
        '1.0',
        'tiers',
        'Annuaire',
        'Building',
        1,
        true,
        true,
        false,
        'manual',
        true,
        true,
        true,
        false,
        false,
        NOW(),
        NOW()
    );

    -- Widgets for Dashboard 5
    INSERT INTO dashboard_widgets (id, dashboard_id, name, widget_type, position_x, position_y, width, height, min_width, min_height, z_index, "order", data_source_type, data_source_config, widget_config, is_visible, is_resizable, is_draggable, is_removable, auto_refresh, refresh_interval, enable_cache, cache_ttl, created_at, updated_at) VALUES
    ('b5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'Total entreprises', 'stats_card', 0, 0, 4, 2, 1, 1, 0, 0, 'api', '{"endpoint": "/api/v1/third-parties/stats"}', '{"title": "Entreprises", "icon": "Building"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000005', 'Total contacts', 'stats_card', 4, 0, 4, 2, 1, 1, 0, 1, 'api', '{"endpoint": "/api/v1/third-parties/contacts/stats"}', '{"title": "Contacts", "icon": "Users"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW()),
    ('b5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005', 'Derniers ajouts', 'table', 0, 2, 12, 5, 1, 1, 0, 2, 'api', '{"endpoint": "/api/v1/third-parties/companies?limit=10"}', '{"title": "Dernières entreprises"}', true, true, true, true, false, 'manual', true, 300, NOW(), NOW());

    RAISE NOTICE 'Created 5 dashboards with widgets successfully!';
END $$;
