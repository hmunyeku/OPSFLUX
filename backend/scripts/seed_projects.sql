-- Seed Projects and Tasks for Gantt Chart
-- Run with: cat seed_projects.sql | docker exec -i opsflux-db-1 psql -U opsflux_user -d opsflux

-- Get admin user ID
DO $$
DECLARE
    admin_id UUID;
    project1_id UUID := gen_random_uuid();
    project2_id UUID := gen_random_uuid();
    project3_id UUID := gen_random_uuid();
BEGIN
    -- Get admin user
    SELECT id INTO admin_id FROM "user" WHERE email = 'admin@opsflux.com' LIMIT 1;

    IF admin_id IS NULL THEN
        RAISE NOTICE 'Admin user not found, using NULL for manager_id';
    END IF;

    -- ================================================================
    -- PROJECT 1: Maintenance Plateforme Alpha
    -- ================================================================
    INSERT INTO project (
        id, name, code, description, status, priority, health,
        start_date, end_date, progress, budget, spent, currency,
        manager_id, client, location, category, color, created_at
    ) VALUES (
        project1_id,
        'Maintenance Plateforme Alpha',
        'MAINT-ALPHA-2024',
        'Maintenance annuelle complète de la plateforme offshore Alpha. Inclut inspection des équipements, révision des systèmes de sécurité et mise à jour des infrastructures.',
        'in_progress',
        'high',
        'on_track',
        '2024-11-01'::timestamp,
        '2025-02-28'::timestamp,
        45.0,
        2500000,
        1125000,
        'EUR',
        admin_id,
        'TotalEnergies',
        'Golfe de Guinée',
        'Maintenance',
        '#3b82f6',
        NOW()
    );

    -- Tasks for Project 1
    INSERT INTO project_task (id, project_id, title, description, status, priority, start_date, due_date, progress, is_milestone, pob, budget, sort_order, created_at) VALUES
    (gen_random_uuid(), project1_id, 'Mobilisation équipe', 'Mobilisation et transport de l''équipe technique vers la plateforme', 'done', 'high', '2024-11-01'::timestamp, '2024-11-05'::timestamp, 100, false, 25, 150000, 1, NOW()),
    (gen_random_uuid(), project1_id, 'Inspection initiale', 'Inspection complète des installations et identification des travaux', 'done', 'high', '2024-11-06'::timestamp, '2024-11-15'::timestamp, 100, false, 30, 200000, 2, NOW()),
    (gen_random_uuid(), project1_id, 'Audit sécurité', 'Audit complet des systèmes de sécurité incendie et évacuation', 'done', 'critical', '2024-11-16'::timestamp, '2024-11-25'::timestamp, 100, true, 15, 180000, 3, NOW()),
    (gen_random_uuid(), project1_id, 'Révision pompes', 'Révision complète des systèmes de pompage et filtration', 'in_progress', 'high', '2024-11-26'::timestamp, '2024-12-15'::timestamp, 60, false, 20, 320000, 4, NOW()),
    (gen_random_uuid(), project1_id, 'Maintenance grues', 'Inspection et maintenance des grues de pont', 'in_progress', 'medium', '2024-12-01'::timestamp, '2024-12-20'::timestamp, 40, false, 12, 280000, 5, NOW()),
    (gen_random_uuid(), project1_id, 'Test systèmes', 'Tests de tous les systèmes après maintenance', 'todo', 'high', '2024-12-21'::timestamp, '2025-01-10'::timestamp, 0, false, 25, 150000, 6, NOW()),
    (gen_random_uuid(), project1_id, 'Certification finale', 'Obtention des certifications de conformité', 'todo', 'critical', '2025-01-11'::timestamp, '2025-01-31'::timestamp, 0, true, 10, 100000, 7, NOW()),
    (gen_random_uuid(), project1_id, 'Démobilisation', 'Démobilisation de l''équipe et clôture du projet', 'todo', 'medium', '2025-02-01'::timestamp, '2025-02-28'::timestamp, 0, false, 25, 120000, 8, NOW());

    -- ================================================================
    -- PROJECT 2: Installation Pipeline Secteur B
    -- ================================================================
    INSERT INTO project (
        id, name, code, description, status, priority, health,
        start_date, end_date, progress, budget, spent, currency,
        manager_id, client, location, category, color, created_at
    ) VALUES (
        project2_id,
        'Installation Pipeline Secteur B',
        'PIPE-SECTB-2024',
        'Installation d''un nouveau pipeline sous-marin de 15km reliant le secteur B au terminal principal.',
        'in_progress',
        'critical',
        'at_risk',
        '2024-10-01'::timestamp,
        '2025-04-30'::timestamp,
        35.0,
        8500000,
        2975000,
        'EUR',
        admin_id,
        'Shell',
        'Mer du Nord',
        'Construction',
        '#ef4444',
        NOW()
    );

    -- Tasks for Project 2
    INSERT INTO project_task (id, project_id, title, description, status, priority, start_date, due_date, progress, is_milestone, pob, budget, sort_order, created_at) VALUES
    (gen_random_uuid(), project2_id, 'Études préliminaires', 'Études géotechniques et bathymétriques du fond marin', 'done', 'high', '2024-10-01'::timestamp, '2024-10-31'::timestamp, 100, false, 15, 450000, 1, NOW()),
    (gen_random_uuid(), project2_id, 'Approvisionnement matériel', 'Commande et livraison des sections de pipeline', 'done', 'critical', '2024-10-15'::timestamp, '2024-11-30'::timestamp, 100, true, 8, 3500000, 2, NOW()),
    (gen_random_uuid(), project2_id, 'Préparation fond marin', 'Nivellement et préparation du tracé sous-marin', 'in_progress', 'high', '2024-12-01'::timestamp, '2024-12-31'::timestamp, 75, false, 45, 680000, 3, NOW()),
    (gen_random_uuid(), project2_id, 'Pose pipeline - Phase 1', 'Installation des 5 premiers kilomètres', 'in_progress', 'critical', '2025-01-01'::timestamp, '2025-01-31'::timestamp, 20, false, 60, 1200000, 4, NOW()),
    (gen_random_uuid(), project2_id, 'Pose pipeline - Phase 2', 'Installation des 5 km suivants', 'todo', 'critical', '2025-02-01'::timestamp, '2025-02-28'::timestamp, 0, false, 60, 1200000, 5, NOW()),
    (gen_random_uuid(), project2_id, 'Pose pipeline - Phase 3', 'Installation des 5 derniers km', 'todo', 'critical', '2025-03-01'::timestamp, '2025-03-31'::timestamp, 0, false, 60, 1200000, 6, NOW()),
    (gen_random_uuid(), project2_id, 'Tests pression', 'Tests hydrostatiques de l''ensemble du pipeline', 'todo', 'high', '2025-04-01'::timestamp, '2025-04-15'::timestamp, 0, true, 30, 180000, 7, NOW()),
    (gen_random_uuid(), project2_id, 'Mise en service', 'Connexion et mise en service opérationnelle', 'todo', 'critical', '2025-04-16'::timestamp, '2025-04-30'::timestamp, 0, true, 25, 90000, 8, NOW());

    -- ================================================================
    -- PROJECT 3: Upgrade Sécurité Q4
    -- ================================================================
    INSERT INTO project (
        id, name, code, description, status, priority, health,
        start_date, end_date, progress, budget, spent, currency,
        manager_id, client, location, category, color, created_at
    ) VALUES (
        project3_id,
        'Upgrade Sécurité Q4',
        'SEC-UPG-Q4-2024',
        'Mise à niveau des systèmes de détection incendie et des équipements de survie sur 3 plateformes.',
        'planning',
        'high',
        'on_track',
        '2024-12-15'::timestamp,
        '2025-03-15'::timestamp,
        10.0,
        1800000,
        180000,
        'EUR',
        admin_id,
        'Perenco',
        'Multiple Sites',
        'Sécurité',
        '#22c55e',
        NOW()
    );

    -- Tasks for Project 3
    INSERT INTO project_task (id, project_id, title, description, status, priority, start_date, due_date, progress, is_milestone, pob, budget, sort_order, created_at) VALUES
    (gen_random_uuid(), project3_id, 'Audit équipements existants', 'Inventaire et évaluation des systèmes actuels', 'done', 'high', '2024-12-15'::timestamp, '2024-12-22'::timestamp, 100, false, 12, 80000, 1, NOW()),
    (gen_random_uuid(), project3_id, 'Spécifications techniques', 'Rédaction des specs pour nouveaux équipements', 'in_progress', 'high', '2024-12-23'::timestamp, '2025-01-05'::timestamp, 50, false, 8, 60000, 2, NOW()),
    (gen_random_uuid(), project3_id, 'Appel d''offres', 'Lancement et évaluation des offres fournisseurs', 'todo', 'medium', '2025-01-06'::timestamp, '2025-01-20'::timestamp, 0, true, 5, 40000, 3, NOW()),
    (gen_random_uuid(), project3_id, 'Installation Plateforme 1', 'Déploiement sur première plateforme', 'todo', 'high', '2025-01-21'::timestamp, '2025-02-10'::timestamp, 0, false, 20, 480000, 4, NOW()),
    (gen_random_uuid(), project3_id, 'Installation Plateforme 2', 'Déploiement sur deuxième plateforme', 'todo', 'high', '2025-02-11'::timestamp, '2025-03-01'::timestamp, 0, false, 20, 480000, 5, NOW()),
    (gen_random_uuid(), project3_id, 'Installation Plateforme 3', 'Déploiement sur troisième plateforme', 'todo', 'high', '2025-03-02'::timestamp, '2025-03-10'::timestamp, 0, false, 20, 480000, 6, NOW()),
    (gen_random_uuid(), project3_id, 'Certification globale', 'Certification de conformité pour les 3 sites', 'todo', 'critical', '2025-03-11'::timestamp, '2025-03-15'::timestamp, 0, true, 10, 100000, 7, NOW());

    RAISE NOTICE 'Successfully seeded 3 projects with % tasks', 23;
END $$;

-- Verify data
SELECT 'Projects created:' as info, count(*) as count FROM project;
SELECT 'Tasks created:' as info, count(*) as count FROM project_task;
