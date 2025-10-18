-- Script de création des traductions CORE
-- Généré le 2025-10-18 08:33:53

-- Création des namespaces

INSERT INTO translation_namespace (id, code, name, description, is_system, created_at, updated_at)
VALUES ('90e25e1f-1ede-428b-8458-ff83b7c35bee', 'core.cache', 'Cache', 'CORE - Cache', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;


INSERT INTO translation_namespace (id, code, name, description, is_system, created_at, updated_at)
VALUES ('d5df692d-c957-4d03-a860-136d9602f30e', 'core.queue', 'Queue', 'CORE - Queue', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;


INSERT INTO translation_namespace (id, code, name, description, is_system, created_at, updated_at)
VALUES ('09e10cb7-4ceb-4ce7-801c-bb6384b17a71', 'core.metrics', 'Metrics', 'CORE - Metrics', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;


INSERT INTO translation_namespace (id, code, name, description, is_system, created_at, updated_at)
VALUES ('48c958e0-1655-40f9-a2e1-06dd0750fc5c', 'core.storage', 'Storage', 'CORE - Storage', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;


-- Création des clés de traduction

INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('9e534c75-d018-479f-b061-a8d0635eb5fd', 'page.title', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1246286d-97f8-44d2-bd59-52aabfe200fc', 'page.description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('c9ffdb8b-65df-406d-a98a-5ff7f8c97df4', 'status.label', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7971bf42-07bd-46b5-a5df-81858dffab68', 'status.connected', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ae91e452-612d-47cc-a133-daf652743a6d', 'status.disconnected', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('878682f7-cb95-43ff-a485-ccb29ba38809', 'status.backend', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6bfe5b51-53b3-417c-b72b-55d96eaa3057', 'actions.refresh', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('d6d14e7e-9a9b-4378-9f96-de31ec37ab6b', 'actions.clear_cache', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7aefc807-8948-4d8b-8d89-5b15a45f89ef', 'stats.hits', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('b390ac62-c871-4366-9b00-d2f3254ca192', 'stats.hits_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('cee6fd4b-ad30-4256-a9f8-2631a0f3e251', 'stats.misses', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7ca8cc19-2701-47e8-bf04-6f796ee9a9fb', 'stats.misses_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1b8f8509-da70-421a-a188-f1d82dbf4355', 'stats.hit_rate', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e4ff65bf-fb21-4bdc-b330-ae7e2daeebc3', 'stats.hit_rate_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6ababff2-d8ea-4cea-a882-43cf99dafd75', 'stats.total_requests', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('cd4ba9cc-b9c9-403c-b264-a5d37ed48de4', 'stats.total_requests_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('279f630a-4b93-44e4-a4f8-45d76a557d5c', 'operations.title', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ebab1e4f-992c-421d-9fd8-01e88153ea1a', 'operations.description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ded7894b-1bce-4e57-89b1-504f13af27c3', 'operations.sets', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('4acdad3d-676f-4675-bcb6-d8b128400a6c', 'operations.deletes', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('38f632dc-ec19-497e-a64e-7d7cad92b8a3', 'operations.redis_hits', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1b24e493-1cb3-482d-9e80-28d2fd71366a', 'recommendations.title', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('9020d6ac-51d4-44be-a489-36d7edf71bbf', 'recommendations.low_hit_rate', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6aabcc61-5344-44ed-a1d2-cdc3b0a28ab8', 'recommendations.low_hit_rate_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('2b6fb5c5-9bde-4936-97a4-1a815ef91f4b', 'recommendations.excellent_performance', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('4b47a0f0-2379-430f-a04f-38e29223fe36', 'recommendations.excellent_performance_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('0efa84b3-b56c-46bd-8344-5b7fb75d5855', 'dialog.clear.title', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('0947a917-e6b9-4fab-a546-dda5d6ca950a', 'dialog.clear.description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('bd2e351e-ecf2-4173-86f3-0ef41dfd2d17', 'dialog.clear.cancel', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('d9cf4fb9-b1c9-4e93-898b-a9f95d229ccb', 'dialog.clear.confirm', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('702aeff3-9171-4e36-94a2-d57bc10baf88', 'dialog.clear.confirming', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('742b705d-6bc7-448f-937e-de84fd38bfaa', 'toast.clear.success', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('00db5f20-3c4b-4fd5-8a5d-754bc663bb20', 'toast.clear.success_description', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('311b9e6b-7de0-4285-b20d-9eb96f18ecbf', 'toast.error.title', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('561bda9d-61ef-4728-b2cb-c92cf60acac5', 'toast.error.load', 'core.cache', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3c51284c-2692-4de2-8296-be91c078e7e6', 'actions.search', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('5aba5ee9-e884-4f1f-aea6-53af83d72191', 'actions.category', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e018523a-73b1-4b6f-89cb-917eb0071b28', 'actions.category_all', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('11ef84db-29ab-4fcb-8602-51cf0b7b7610', 'actions.category_documents', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1a6fe5d1-8727-4343-b64a-eb7282b38b86', 'actions.category_images', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7ffa2d86-5af4-480b-a518-c0c6671f9d04', 'actions.category_videos', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('21eef5f4-5843-4521-bc3a-d1d4c01dde70', 'actions.category_audio', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('9996ede6-30d5-416e-9598-e6a897cbb7cb', 'actions.category_archives', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('2f869a6d-7fa4-4348-8605-4967ae173b31', 'actions.upload', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('67d58487-101e-4b2c-9070-a67f64c506a7', 'stats.total_files', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('73b2803c-da7a-48c3-a758-d8c8cb761fbf', 'stats.total_size', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3b74100b-295b-4a21-903a-ee9de8e6f525', 'stats.categories', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('f3f72b1a-8272-4fa2-8f63-74db6ddff299', 'files.title', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('376763d1-56d5-4fcb-b127-b3ffbe34b517', 'files.count', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ec32dd04-f61a-4d4e-b8ab-4b6d017449b5', 'files.search_results', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7e632325-fd7d-434f-a04e-668f7c8d7270', 'files.empty', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('68709507-792b-4336-8099-e69b12b3ca69', 'dialog.upload.title', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('49d808c4-6007-4c51-97e9-341bb69386d4', 'dialog.upload.description', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('a322ff47-7039-459a-8de2-38c084b4b49f', 'dialog.upload.file_label', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('de61ce41-4c58-4c1c-b0b5-a081321e6a13', 'dialog.upload.size_label', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('97e5b33b-348c-4505-a4aa-c13e48eac3f3', 'dialog.upload.cancel', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('b925f7e2-4cd9-407d-b9bf-93b50e67cb1e', 'dialog.upload.confirm', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('a224e2fd-556c-4660-b429-fb888c017018', 'dialog.upload.uploading', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('224a7956-816f-474b-90c2-b207e46790c0', 'dialog.delete.title', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('68347aef-9544-4dcf-8f33-55b3c61f8523', 'dialog.delete.description', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('56396d41-ae09-4879-a9d3-cfa4495a160e', 'dialog.delete.cancel', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('df88ab51-c63e-4ae8-b5f6-3c29e72aa0f5', 'dialog.delete.confirm', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6a1af903-6d76-4a0b-960e-c1a3004d5a96', 'toast.upload.success', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('9abd51e9-8ab7-4cd2-926b-b8db026aa6a8', 'toast.upload.success_description', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e7ed3706-cb3a-443d-a695-a18e6c7bd4c5', 'toast.upload.error', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('905019bd-08f0-47c2-bbe0-124504f714de', 'toast.delete.success', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('bcca9465-4936-4b3d-8d33-6efd93969a97', 'toast.delete.success_description', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('55fa46b4-7586-4158-97b7-db50dd2fe0df', 'toast.error.delete', 'core.storage', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6aa91d57-8463-438a-86fd-098f9d2cc9cc', 'workers.active_label', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('59c113c2-ff7f-494d-81d1-b4ee390b1c18', 'stats.active_tasks', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('70e7cdc8-9813-4c0c-b7a7-27d08267e434', 'stats.active_tasks_description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('bb2da445-11e0-4ae3-bc67-038733a34187', 'stats.scheduled_tasks', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('695286dc-9a38-4f78-b21c-27584c6e9f80', 'stats.scheduled_tasks_description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('dfc5dc09-baf8-4b2c-8718-1034a1a10fa8', 'stats.reserved_tasks', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('b5c5e6f4-0f87-4938-9b1b-b6f9c548a013', 'stats.reserved_tasks_description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7d5e6258-01e6-4b6c-83bc-8d0e002b6792', 'stats.workers', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('937458ca-d260-421c-8adb-7cdfff27c86a', 'stats.workers_description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('729f76a4-b44e-4121-acc9-f11eb15de419', 'workers.title', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('672b7408-e549-46ca-ae9b-ec6fc32b2563', 'workers.description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('5a0bfbc7-af77-428b-afd6-d04abbf28913', 'workers.empty', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('f4412c00-c86e-4a15-8d63-605ec1cae637', 'workers.empty_description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('fafa8c33-0ec2-4806-9fcc-7c92f810a422', 'workers.status_active', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7f87d65a-cda7-4e0f-b6f6-303f73165998', 'workers.active', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('98791a6e-67f4-4f85-a473-ab37b2466adc', 'workers.scheduled', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('926fb0e3-056d-4e52-af61-a91bf90f578a', 'workers.reserved', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('828a7910-754f-43ce-a76a-8736b270b06c', 'queues.title', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('8001343f-c964-4f5b-aa12-c34299b868fe', 'queues.description', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('bd9176de-3428-4420-a8ff-2c16508c8fba', 'queues.tasks_count', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('a1e37dcd-98dd-43c9-8fb4-f62e91faf094', 'info.title', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1ad595d7-6239-4416-aa09-521aecf1baf3', 'info.workers', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('37484dd4-f61c-474f-87ba-5ac161264230', 'info.distribution', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('501e4ff1-33c3-48ce-86da-9564c1bd92ab', 'info.scaling', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1ff05ad4-30e8-479e-9e0c-50207b540368', 'status.success', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('d491a9a2-1f6c-4259-a3b1-cd00c63b7567', 'status.pending', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3de3b45f-a119-46bc-a434-eb4d3c7a7555', 'status.started', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('df48727b-e048-481e-a333-aed0143ed0d6', 'status.failure', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3a844a3f-18b3-4fa5-835e-9683ed84868b', 'status.retry', 'core.queue', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('8013f0e9-61d0-4a5a-a033-b3e5f579a944', 'total.label', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('0bee6bf0-56a1-4855-a77d-9ecdcc5a3e62', 'actions.reset', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('606bfcb3-dbd8-42cb-b4ca-6f30ae38e075', 'stats.total', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('f6253720-3ab2-42d1-b925-93c478c9c166', 'stats.total_description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3648647f-46a2-4086-8f60-3e7d78b0ef0f', 'stats.counters', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('18eaabd9-e6c1-43af-a65a-8b2d7d05f451', 'stats.counters_description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('29786379-440d-49ab-adc1-526f72ac075d', 'stats.gauges', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e4bf7f5c-b13c-493a-95d2-cf1e5b3c834a', 'stats.gauges_description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('a47b0f2e-68bd-4468-b0b5-14cc52fcdfa6', 'stats.histograms', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e3be26f6-dd3d-45ed-b5f8-335a2dde0f47', 'stats.histograms_description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ace65303-cfea-4de5-b09e-ba82cfd830ac', 'metrics.title', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1591ac9d-4de6-45bb-8ea9-44fd86e6aa58', 'metrics.description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('a3e05cb7-475f-4e8b-898f-6fe15ead3a8f', 'metrics.empty', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('1e9cb056-2032-454b-8af7-0ecc1055006f', 'metrics.value', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('31b45606-abba-46ba-b9c7-f0231601eedd', 'metrics.no_data', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('ff29a44e-d059-4d1f-89f6-9ab5a1f5b326', 'metrics.count', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('2419a2e4-598f-4a88-b5d5-ddc5857ae81b', 'metrics.sum', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('84ad7575-a4a5-40d6-9b4f-9006c434fc07', 'metrics.buckets', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('6fdd5d13-7c3b-4512-aa12-1278434c83f9', 'info.counters', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('50ef31b4-c3e8-4797-921f-7e3472f8a712', 'info.gauges', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3c6524a9-e86c-484f-9829-11d959a654af', 'info.histograms', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('7d1b8850-6e0c-4106-9387-518e156b3907', 'info.prometheus', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('f51c7ea6-dbbf-4810-ab50-39653bad7584', 'dialog.reset.title', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('d5bd0b45-e7ee-4d18-bff5-edeab3d0fe8f', 'dialog.reset.description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('47b274f9-0524-4913-8fe3-0362bd2bfa4c', 'dialog.reset.cancel', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('e2d6fb42-c2d3-49b7-bd39-8d82b911b21e', 'dialog.reset.confirm', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('d32f8bc9-b5f9-41fe-bd32-9bd0f67b9714', 'dialog.reset.resetting', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('3b72a51b-d8ce-4a5c-b835-eb24002850b5', 'toast.reset.success', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('5baab582-6607-4380-a937-2ac6ae36046e', 'toast.reset.success_description', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


INSERT INTO translation_key (id, key, namespace_code, context, is_system, created_at, updated_at)
VALUES ('9d586f7e-c54b-437d-94c5-9dabb227f3c1', 'toast.error.reset', 'core.metrics', NULL, true, NOW(), NOW())
ON CONFLICT (key, namespace_code) DO NOTHING;


-- Création des traductions

INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '5402708b-2e4e-45d3-95ee-74ff32f67e3c', 'page.title', 'core.cache', 'fr', 'Gestion du Cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'page.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '3f075480-0098-4773-9983-96e39d83bd39', 'page.title', 'core.cache', 'en', 'Gestion du Cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'page.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '2d37751b-4403-42d2-81a0-c79ad32475e1', 'page.description', 'core.cache', 'fr', 'Monitoring et gestion du cache Redis', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'page.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f5dfd6d8-9fff-45fa-a344-af85188c6c6c', 'page.description', 'core.cache', 'en', 'Monitoring et gestion du cache Redis', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'page.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'aff0a478-09a6-46df-a217-40973d33c973', 'status.label', 'core.cache', 'fr', 'Redis Status', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.label' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f1ee7817-69a6-4498-b538-2f4903506f4f', 'status.label', 'core.cache', 'en', 'Redis Status', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.label' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '583a6ec9-8299-4cd5-a301-bfb42b9d2fcf', 'status.connected', 'core.cache', 'fr', 'Connecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.connected' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '9ef4e285-b497-4c4a-8e17-a329ed24cb61', 'status.connected', 'core.cache', 'en', 'Connecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.connected' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '08fd9f4e-abf7-4562-8a78-6d6aa39a9448', 'status.disconnected', 'core.cache', 'fr', 'Déconnecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.disconnected' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '3a64add5-611a-4436-bc0a-5ef5909db237', 'status.disconnected', 'core.cache', 'en', 'Déconnecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.disconnected' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '9bb7ad62-eea6-4315-aa36-bf3716ad5924', 'status.backend', 'core.cache', 'fr', 'Backend', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.backend' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'aa35bc26-48ba-4d2c-918c-ec1c74de3371', 'status.backend', 'core.cache', 'en', 'Backend', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.backend' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '56aa1610-0b68-4c0f-a2be-0093d0027dfd', 'actions.refresh', 'core.cache', 'fr', 'Actualiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.refresh' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '5a91d24a-d8cc-47b3-ae7c-4145d6926ab5', 'actions.refresh', 'core.cache', 'en', 'Actualiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.refresh' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f0285e67-21e1-4e79-9c55-0156b965dc95', 'actions.clear_cache', 'core.cache', 'fr', 'Vider le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.clear_cache' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '9a525c3d-a1be-4ae1-85ea-f52b51ea2b23', 'actions.clear_cache', 'core.cache', 'en', 'Vider le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.clear_cache' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '44545856-70f4-4ce0-9e51-b9e6759e4c3f', 'stats.hits', 'core.cache', 'fr', 'Hits', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hits' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ca2c285e-cbdc-4aee-af56-06b05020a433', 'stats.hits', 'core.cache', 'en', 'Hits', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hits' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c8ed3564-32f4-4345-b017-e93d1843fd41', 'stats.hits_description', 'core.cache', 'fr', 'Requêtes trouvées dans le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hits_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '83648645-4a7b-471c-b1e2-2d47f882c392', 'stats.hits_description', 'core.cache', 'en', 'Requêtes trouvées dans le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hits_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f59aace5-0322-4f0a-b508-9b039c9dd9e4', 'stats.misses', 'core.cache', 'fr', 'Misses', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.misses' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'bf302fac-a069-4d41-b714-9a97eec55ed3', 'stats.misses', 'core.cache', 'en', 'Misses', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.misses' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '6454558b-cd57-49b8-b923-546935197e95', 'stats.misses_description', 'core.cache', 'fr', 'Requêtes non trouvées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.misses_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '4aa398c3-cac1-47de-b952-6d323dc4e780', 'stats.misses_description', 'core.cache', 'en', 'Requêtes non trouvées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.misses_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '488fff7b-1964-4f17-94b8-39a2bc3cda08', 'stats.hit_rate', 'core.cache', 'fr', 'Taux de succès', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hit_rate' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '9a53814d-5d3f-4282-88bc-3c5d1650d559', 'stats.hit_rate', 'core.cache', 'en', 'Taux de succès', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hit_rate' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '5cc92c9b-31a1-4530-99a6-20aaf93d8cc9', 'stats.hit_rate_description', 'core.cache', 'fr', 'Efficacité du cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hit_rate_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e6bde731-2435-4047-8066-9fd53b56600c', 'stats.hit_rate_description', 'core.cache', 'en', 'Efficacité du cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.hit_rate_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '621f9872-bf22-4dba-9674-3b6766106bc0', 'stats.total_requests', 'core.cache', 'fr', 'Total requêtes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_requests' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '96bedef9-cb74-48a3-a754-38838829ebf8', 'stats.total_requests', 'core.cache', 'en', 'Total requêtes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_requests' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'de223651-38a2-403f-9e66-43d61083fe5b', 'stats.total_requests_description', 'core.cache', 'fr', 'Hits + Misses', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_requests_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '6a31dde6-2dc8-45be-83e0-4263f90072e1', 'stats.total_requests_description', 'core.cache', 'en', 'Hits + Misses', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_requests_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c84aebc1-ec2f-4a2f-ab81-66881a053cc1', 'operations.title', 'core.cache', 'fr', 'Opérations', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '54543b17-e15a-4e88-8fc1-cff5739503bd', 'operations.title', 'core.cache', 'en', 'Opérations', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '20908d37-875d-4df6-98ca-65cce85fbc0a', 'operations.description', 'core.cache', 'fr', 'Statistiques des opérations de cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e60b92b0-0bc1-4da9-bfe3-1236955609b2', 'operations.description', 'core.cache', 'en', 'Statistiques des opérations de cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '290d4445-3bec-463c-be92-99897e5acfed', 'operations.sets', 'core.cache', 'fr', 'Sets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.sets' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '2a8ddae0-e671-4144-a9ff-a2f33b26e4d3', 'operations.sets', 'core.cache', 'en', 'Sets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.sets' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '724cd0a0-a49c-4c9f-a621-8354801f5d91', 'operations.deletes', 'core.cache', 'fr', 'Deletes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.deletes' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '6a61b4a7-6385-4c00-a1f0-b75008097212', 'operations.deletes', 'core.cache', 'en', 'Deletes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.deletes' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd8187fda-f914-4367-b366-1c7676855e51', 'operations.redis_hits', 'core.cache', 'fr', 'Redis Hits', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.redis_hits' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '661fdce3-417a-457b-add0-92e24d3fa8b9', 'operations.redis_hits', 'core.cache', 'en', 'Redis Hits', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'operations.redis_hits' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f19fc8ee-53ae-4c36-9427-1539db5fd8d2', 'recommendations.title', 'core.cache', 'fr', 'Recommandations', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '072a2288-6110-4944-a3ae-a8b8a039f34c', 'recommendations.title', 'core.cache', 'en', 'Recommandations', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '3097a5e5-9f38-4c0a-8620-ae6747435694', 'recommendations.low_hit_rate', 'core.cache', 'fr', 'Taux de succès faible', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.low_hit_rate' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'c8238f99-fadc-4bfe-81ef-9c67df559348', 'recommendations.low_hit_rate', 'core.cache', 'en', 'Taux de succès faible', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.low_hit_rate' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '657995fc-4158-4901-9182-8050b05421df', 'recommendations.low_hit_rate_description', 'core.cache', 'fr', 'Considérez augmenter les TTL ou revoir la stratégie de cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.low_hit_rate_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'da75d9f4-780e-4c82-95d6-b0932422739a', 'recommendations.low_hit_rate_description', 'core.cache', 'en', 'Considérez augmenter les TTL ou revoir la stratégie de cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.low_hit_rate_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '87556fc8-0334-40f2-9634-64cfa167c4b4', 'recommendations.excellent_performance', 'core.cache', 'fr', 'Excellente performance du cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.excellent_performance' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '488f54e5-2f75-4845-9f39-fe3180bb632a', 'recommendations.excellent_performance', 'core.cache', 'en', 'Excellente performance du cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.excellent_performance' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f404bbe2-7480-4546-94b0-50701213e1f3', 'recommendations.excellent_performance_description', 'core.cache', 'fr', 'Le cache est bien optimisé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.excellent_performance_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7f8b1673-48d8-4ede-b4df-4310c5b2405f', 'recommendations.excellent_performance_description', 'core.cache', 'en', 'Le cache est bien optimisé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'recommendations.excellent_performance_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '3e7eb131-debf-4f2f-a39b-5b708d2d0ee5', 'dialog.clear.title', 'core.cache', 'fr', 'Vider le cache ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '10d726b6-3af2-4b44-9f56-e3c9e069f4ba', 'dialog.clear.title', 'core.cache', 'en', 'Vider le cache ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f1ec6e44-d945-4c2b-a1f1-96372bd75649', 'dialog.clear.description', 'core.cache', 'fr', 'Cette action supprimera toutes les données en cache. L''application continuera de fonctionner mais les performances pourraient être temporairement réduites.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '77c5b8d4-243f-4437-b298-dd5dfd37bd73', 'dialog.clear.description', 'core.cache', 'en', 'Cette action supprimera toutes les données en cache. L''application continuera de fonctionner mais les performances pourraient être temporairement réduites.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '8e810f4c-3e82-4e4c-9540-062459f40ff5', 'dialog.clear.cancel', 'core.cache', 'fr', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.cancel' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a267f82d-3b78-456e-92b8-5f30ce898ddb', 'dialog.clear.cancel', 'core.cache', 'en', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.cancel' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd1325f7c-722c-4188-9787-f92333601978', 'dialog.clear.confirm', 'core.cache', 'fr', 'Vider le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.confirm' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a556a537-e051-4d6f-b2b1-8b3477a087fe', 'dialog.clear.confirm', 'core.cache', 'en', 'Vider le cache', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.confirm' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '8ded65ff-0f54-4e27-93a4-0575f0c3b419', 'dialog.clear.confirming', 'core.cache', 'fr', 'En cours...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.confirming' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '43bdf4f7-e66e-497c-a1aa-d56b2f59b7a9', 'dialog.clear.confirming', 'core.cache', 'en', 'En cours...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.clear.confirming' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c93243b5-9436-4ed0-befe-2ca2d43d18a3', 'toast.clear.success', 'core.cache', 'fr', 'Cache vidé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.clear.success' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '21a8fa0a-1370-43d5-af87-c8e80e609824', 'toast.clear.success', 'core.cache', 'en', 'Cache vidé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.clear.success' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '93257017-34c8-4f08-a710-df61f5d3f572', 'toast.clear.success_description', 'core.cache', 'fr', '{keys_deleted} clés supprimées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.clear.success_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '61d8ceba-dbec-4a8d-9482-99f8ca156918', 'toast.clear.success_description', 'core.cache', 'en', '{keys_deleted} clés supprimées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.clear.success_description' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '0ef5e30f-dbf6-4363-b3d7-2444892502d1', 'toast.error.title', 'core.cache', 'fr', 'Erreur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '0dbdde4c-ca29-4731-a9bc-e4f79bae5a70', 'toast.error.title', 'core.cache', 'en', 'Erreur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.title' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '6c973656-2378-432d-8dd4-0a3a025e701e', 'toast.error.load', 'core.cache', 'fr', 'Impossible de charger les données du cache.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.load' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '3089309c-d5d1-40ae-a1ae-1e92d50a3d82', 'toast.error.load', 'core.cache', 'en', 'Impossible de charger les données du cache.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.load' AND namespace_code = 'core.cache')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '6bc3a139-0ff7-48ee-9648-3369c997b328', 'actions.search', 'core.storage', 'fr', 'Rechercher un fichier...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.search' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'eb99b94f-2464-4611-b911-c3f3bd718d75', 'actions.search', 'core.storage', 'en', 'Rechercher un fichier...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.search' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '9c10a805-67af-4613-9e8d-250dbe0d751f', 'actions.category', 'core.storage', 'fr', 'Catégorie', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'be403c6f-e33b-4661-8548-3f92bf83a495', 'actions.category', 'core.storage', 'en', 'Catégorie', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'ac8ec45d-2921-416c-8080-2a534f7abeea', 'actions.category_all', 'core.storage', 'fr', 'Toutes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_all' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '1a647064-edc3-40a8-a7b4-da4c844237ec', 'actions.category_all', 'core.storage', 'en', 'Toutes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_all' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '62a89ed9-3916-4cb7-b812-37f3fdc65b24', 'actions.category_documents', 'core.storage', 'fr', 'Documents', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_documents' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '4f8b5b74-053f-4c82-b254-f9f5ed6e5681', 'actions.category_documents', 'core.storage', 'en', 'Documents', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_documents' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '9234355e-2787-494e-ab09-2fb13412e658', 'actions.category_images', 'core.storage', 'fr', 'Images', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_images' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e1818ed0-c81d-478b-b389-9570f77af287', 'actions.category_images', 'core.storage', 'en', 'Images', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_images' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '0f5bfbb3-eca3-4a00-a90d-d09ec826d7da', 'actions.category_videos', 'core.storage', 'fr', 'Vidéos', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_videos' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '0a40a4d2-c7d3-4cd3-b78c-1da1e047e894', 'actions.category_videos', 'core.storage', 'en', 'Vidéos', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_videos' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f2c537b7-994a-4bb1-ad31-bff3482d901f', 'actions.category_audio', 'core.storage', 'fr', 'Audio', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_audio' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b14c2af2-a012-44c3-87a0-4683ed914a32', 'actions.category_audio', 'core.storage', 'en', 'Audio', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_audio' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a2844503-c559-4e05-902a-569fa82cbfe9', 'actions.category_archives', 'core.storage', 'fr', 'Archives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_archives' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f54be92a-4514-4924-8d2c-78e5cab4dd93', 'actions.category_archives', 'core.storage', 'en', 'Archives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.category_archives' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'ed6fb5ed-8d68-4ec6-9491-d6e6c5610716', 'actions.upload', 'core.storage', 'fr', 'Upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.upload' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '06f01d41-cd41-4021-b3f6-5b848faacedd', 'actions.upload', 'core.storage', 'en', 'Upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.upload' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '64998324-d9c1-4ae1-842a-778794065a1e', 'stats.total_files', 'core.storage', 'fr', 'Total fichiers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_files' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '56e7a546-a479-4f8f-9127-78f573b06bee', 'stats.total_files', 'core.storage', 'en', 'Total fichiers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_files' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'e40abba9-2433-449c-951f-d369e8011aa1', 'stats.total_size', 'core.storage', 'fr', 'Taille totale', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_size' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'bc2547f8-746f-46b9-a0a9-2302b5101db2', 'stats.total_size', 'core.storage', 'en', 'Taille totale', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_size' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '4832e73a-252f-4938-a82c-47a214fdde17', 'stats.categories', 'core.storage', 'fr', 'Catégories', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.categories' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e3b07d65-695f-4dfc-9bf3-0b13cedf09a4', 'stats.categories', 'core.storage', 'en', 'Catégories', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.categories' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '8aa61292-b60d-493e-bdd3-db2c70d794b1', 'files.title', 'core.storage', 'fr', 'Fichiers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '85029f40-16be-489e-9a12-f97282b16e1a', 'files.title', 'core.storage', 'en', 'Fichiers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '2d6a4c4b-74d2-485f-a011-96f43dda84aa', 'files.count', 'core.storage', 'fr', '{count} fichier(s)', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.count' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ea3ff172-0ba3-472b-a56b-59bee1dce70e', 'files.count', 'core.storage', 'en', '{count} fichier(s)', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.count' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '5c6e7cb7-bb34-4593-835f-89022475cdf1', 'files.search_results', 'core.storage', 'fr', 'correspondant à "{query}"', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.search_results' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '1ecaa1e6-e24d-487b-a5b2-325b3fddaac2', 'files.search_results', 'core.storage', 'en', 'correspondant à "{query}"', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.search_results' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'e7e2a20e-be98-46ed-b314-33fd35f84a55', 'files.empty', 'core.storage', 'fr', 'Aucun fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.empty' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'dd13c401-a351-46f9-9cf3-e0a09592d573', 'files.empty', 'core.storage', 'en', 'Aucun fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'files.empty' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'fd2a8271-bb5f-4162-a883-222da972ca71', 'dialog.upload.title', 'core.storage', 'fr', 'Upload un fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'dc0ed86e-1a40-4cd3-b88f-a9fa76db6248', 'dialog.upload.title', 'core.storage', 'en', 'Upload un fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '9c9979a2-3257-4652-9a7b-be63c9da7f1b', 'dialog.upload.description', 'core.storage', 'fr', 'Sélectionnez un fichier à uploader sur le serveur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '940762b7-1f37-49d8-884d-4c76bfd97a67', 'dialog.upload.description', 'core.storage', 'en', 'Sélectionnez un fichier à uploader sur le serveur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'b1e46a74-dad4-4f63-9342-e989f422e8c4', 'dialog.upload.file_label', 'core.storage', 'fr', 'Fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.file_label' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '2cb417d9-68c9-4e4b-81d3-6c35687036d1', 'dialog.upload.file_label', 'core.storage', 'en', 'Fichier', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.file_label' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c8f4341b-936c-459c-9d55-3c32c2ca1ae1', 'dialog.upload.size_label', 'core.storage', 'fr', 'Taille', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.size_label' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '583371cf-010f-4d20-8ef3-2381f0d3a39c', 'dialog.upload.size_label', 'core.storage', 'en', 'Taille', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.size_label' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '71986c27-de44-401c-bebd-70e6c0195fe6', 'dialog.upload.cancel', 'core.storage', 'fr', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.cancel' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f0835672-4471-4080-8d32-31117c715a9f', 'dialog.upload.cancel', 'core.storage', 'en', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.cancel' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '69bac65c-c250-486a-9e33-11cc103c3bd6', 'dialog.upload.confirm', 'core.storage', 'fr', 'Upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.confirm' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '968319ac-e2d1-4ce7-9483-9ca83bdab404', 'dialog.upload.confirm', 'core.storage', 'en', 'Upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.confirm' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '09c4ce91-910d-4627-b4f2-d322bf62cc59', 'dialog.upload.uploading', 'core.storage', 'fr', 'Upload...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.uploading' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '2143dfc9-59ef-4945-b85d-5b94e3584b77', 'dialog.upload.uploading', 'core.storage', 'en', 'Upload...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.upload.uploading' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a9344052-a958-47f5-afb7-3bb83e5364fd', 'dialog.delete.title', 'core.storage', 'fr', 'Supprimer le fichier ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b49037c3-45df-46b8-adc7-6767ec166ef3', 'dialog.delete.title', 'core.storage', 'en', 'Supprimer le fichier ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.title' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'dac51fb0-6d49-459d-a8e3-af0153ef6f6b', 'dialog.delete.description', 'core.storage', 'fr', 'Êtes-vous sûr de vouloir supprimer {filename} ? Cette action est irréversible.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '1d2495bc-89b9-4d70-94ad-a22c723ce9c5', 'dialog.delete.description', 'core.storage', 'en', 'Êtes-vous sûr de vouloir supprimer {filename} ? Cette action est irréversible.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c9ad25a4-4e73-481c-98ee-bae930c608e9', 'dialog.delete.cancel', 'core.storage', 'fr', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.cancel' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '0434e124-8ad0-430c-9c58-38c239a6f454', 'dialog.delete.cancel', 'core.storage', 'en', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.cancel' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a9327148-9f31-4ce8-8ef6-444aa55deed3', 'dialog.delete.confirm', 'core.storage', 'fr', 'Supprimer', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.confirm' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '3bf33531-ea17-4585-aa4b-6cbc91c7ff76', 'dialog.delete.confirm', 'core.storage', 'en', 'Supprimer', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.delete.confirm' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '5ef51209-6589-4dec-b515-f665510c48df', 'toast.upload.success', 'core.storage', 'fr', 'Fichier uploadé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.success' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a83a0c9b-90c3-4817-b63b-024e1b729357', 'toast.upload.success', 'core.storage', 'en', 'Fichier uploadé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.success' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '89db4a0e-32ae-4223-844c-71d5b6ec27d7', 'toast.upload.success_description', 'core.storage', 'fr', '{filename} a été uploadé avec succès.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.success_description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '2efaf6c1-8a53-458d-bf08-3a4943f14d64', 'toast.upload.success_description', 'core.storage', 'en', '{filename} a été uploadé avec succès.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.success_description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '4cc8110c-5e19-4901-8626-bf7a74a5281c', 'toast.upload.error', 'core.storage', 'fr', 'Erreur d''upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.error' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a221e744-43d2-425f-ab93-978090399f29', 'toast.upload.error', 'core.storage', 'en', 'Erreur d''upload', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.upload.error' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '96a668a4-307d-4419-b3a6-d57d133d244a', 'toast.delete.success', 'core.storage', 'fr', 'Fichier supprimé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.delete.success' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f612bf70-95ea-47cc-8e58-d5fa334200ef', 'toast.delete.success', 'core.storage', 'en', 'Fichier supprimé', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.delete.success' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '9696017a-1623-4f2c-9abb-a79f1ff69e2d', 'toast.delete.success_description', 'core.storage', 'fr', '{filename} a été supprimé.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.delete.success_description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '4f4ae17f-07b2-4cd3-a563-3b754a05bb8f', 'toast.delete.success_description', 'core.storage', 'en', '{filename} a été supprimé.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.delete.success_description' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'fb2514b3-6f61-4f99-bc1a-bc4c9a904cae', 'toast.error.delete', 'core.storage', 'fr', 'Impossible de supprimer le fichier.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.delete' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '88f15753-5424-4d8e-aa8d-8f12d8e2dff5', 'toast.error.delete', 'core.storage', 'en', 'Impossible de supprimer le fichier.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.delete' AND namespace_code = 'core.storage')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '4141f391-dd99-4e52-9c2b-bac92cb92b45', 'workers.active_label', 'core.queue', 'fr', 'Workers actifs', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.active_label' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'cb9b1e99-cc9f-4675-b866-6512b4525095', 'workers.active_label', 'core.queue', 'en', 'Workers actifs', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.active_label' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '2807ff37-0de9-4759-9e3a-ff6ee40926d1', 'stats.active_tasks', 'core.queue', 'fr', 'Tâches actives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.active_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '38cb512e-8db0-45a6-b1aa-87b0315a1d74', 'stats.active_tasks', 'core.queue', 'en', 'Tâches actives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.active_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'fe487ac4-197c-4648-bdf4-093956049a29', 'stats.active_tasks_description', 'core.queue', 'fr', 'En cours d''exécution', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.active_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '196c088e-047d-42d4-9a74-4368b6d5b72b', 'stats.active_tasks_description', 'core.queue', 'en', 'En cours d''exécution', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.active_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '36e38e86-3072-49d5-921d-51977db4b726', 'stats.scheduled_tasks', 'core.queue', 'fr', 'Tâches planifiées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.scheduled_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '22f09613-6236-454e-87f6-5e84d7023215', 'stats.scheduled_tasks', 'core.queue', 'en', 'Tâches planifiées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.scheduled_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'ed46da71-e93b-4534-9463-1b281aca841a', 'stats.scheduled_tasks_description', 'core.queue', 'fr', 'Programmées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.scheduled_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'c54958aa-9f6e-4e9a-97fe-9bdb32db330e', 'stats.scheduled_tasks_description', 'core.queue', 'en', 'Programmées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.scheduled_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'faf5f228-dd4c-4855-9c51-ebbe13695a3e', 'stats.reserved_tasks', 'core.queue', 'fr', 'Tâches réservées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.reserved_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ee01b8e0-d677-4d7d-9d36-1837a059b4ef', 'stats.reserved_tasks', 'core.queue', 'en', 'Tâches réservées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.reserved_tasks' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '18a12a11-6432-4284-aa83-4881d0240d2f', 'stats.reserved_tasks_description', 'core.queue', 'fr', 'Pré-allouées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.reserved_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'eadbe93d-a410-412e-b2f2-8f32bd0a3896', 'stats.reserved_tasks_description', 'core.queue', 'en', 'Pré-allouées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.reserved_tasks_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd23f9b60-6574-49e7-a8c4-b8070614d215', 'stats.workers', 'core.queue', 'fr', 'Workers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.workers' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '261ffd65-7d8c-49cf-9d8c-b1e638791533', 'stats.workers', 'core.queue', 'en', 'Workers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.workers' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '4c4cd4c6-739d-42c7-a18c-6d310755b9df', 'stats.workers_description', 'core.queue', 'fr', 'Connectés', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.workers_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7fa73e10-58e1-4d5a-a8d5-1222a7021cd6', 'stats.workers_description', 'core.queue', 'en', 'Connectés', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.workers_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '8cb8b662-0324-42eb-a7bf-d2ce997891af', 'workers.title', 'core.queue', 'fr', 'Workers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'd8c14336-d5df-4f92-ad29-627937a604f4', 'workers.title', 'core.queue', 'en', 'Workers', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '4db2b7bd-ee7b-4eb1-b7b1-f1b5a838f035', 'workers.description', 'core.queue', 'fr', 'État des workers Celery', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'cdde68cb-d4f6-4545-bd15-c580182cd3c1', 'workers.description', 'core.queue', 'en', 'État des workers Celery', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd3eeac18-59bf-4055-9673-dca6b8e9445b', 'workers.empty', 'core.queue', 'fr', 'Aucun worker connecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.empty' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'fb2103d5-08b1-4e3f-9c5d-4d849e782800', 'workers.empty', 'core.queue', 'en', 'Aucun worker connecté', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.empty' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '1374610d-2b5f-4667-8bbc-45cc3bc0e5d5', 'workers.empty_description', 'core.queue', 'fr', 'Démarrez les workers Celery pour traiter les tâches', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.empty_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '338b220b-5fff-464b-b159-b4ca2c6670a5', 'workers.empty_description', 'core.queue', 'en', 'Démarrez les workers Celery pour traiter les tâches', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.empty_description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '19874931-c292-43c0-a90b-3c2af0b26d71', 'workers.status_active', 'core.queue', 'fr', 'Actif', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.status_active' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'd6f6cf0b-73e5-489c-905d-7bbb74d10874', 'workers.status_active', 'core.queue', 'en', 'Actif', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.status_active' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '3b8fecfd-d4fd-4f3a-8b05-b03795a727da', 'workers.active', 'core.queue', 'fr', 'Actives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.active' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '69c4f752-acd5-4b13-9da8-13e3b367ca9f', 'workers.active', 'core.queue', 'en', 'Actives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.active' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '418adf3e-1aee-4e56-9ea7-4820b9443f8b', 'workers.scheduled', 'core.queue', 'fr', 'Planifiées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.scheduled' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'f2267c50-390b-4114-8f3e-3cfdea62c6b7', 'workers.scheduled', 'core.queue', 'en', 'Planifiées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.scheduled' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd875a1ac-b410-47b5-acb4-50c4b502b1c4', 'workers.reserved', 'core.queue', 'fr', 'Réservées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.reserved' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '14166268-b187-4fa5-a31b-65113814620e', 'workers.reserved', 'core.queue', 'en', 'Réservées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'workers.reserved' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'bebb7713-0062-4536-9db5-295234a4f041', 'queues.title', 'core.queue', 'fr', 'Queues', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'bdbdee4c-0953-40bb-bc08-5097c2380f0d', 'queues.title', 'core.queue', 'en', 'Queues', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '0a595210-c6b5-47ae-be26-f0da462bd72d', 'queues.description', 'core.queue', 'fr', 'État des files d''attente', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a702fba0-77c9-4bb7-b2e6-be0cd8d1f0ff', 'queues.description', 'core.queue', 'en', 'État des files d''attente', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.description' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'bc1e233f-f532-43e5-ac3d-75357c3320c6', 'queues.tasks_count', 'core.queue', 'fr', '{count} tâche(s)', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.tasks_count' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '671ab9dc-c152-41e3-a4d5-817799f7bee0', 'queues.tasks_count', 'core.queue', 'en', '{count} tâche(s)', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'queues.tasks_count' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f665fc5c-d52f-470b-88c9-320676cb38fb', 'info.title', 'core.queue', 'fr', 'Information', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7b3bd3a7-bab2-4188-bea9-93882f618b4a', 'info.title', 'core.queue', 'en', 'Information', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.title' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '60d914ac-8f95-41a5-8c4c-ee2a93a6c79f', 'info.workers', 'core.queue', 'fr', 'Les workers Celery traitent les tâches asynchrones en arrière-plan', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.workers' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '8321a470-5766-4ac6-96b9-e91a42545275', 'info.workers', 'core.queue', 'en', 'Les workers Celery traitent les tâches asynchrones en arrière-plan', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.workers' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a9fb63c0-5c87-4a31-ba71-4c9e7c47bfa2', 'info.distribution', 'core.queue', 'fr', 'Les tâches sont réparties selon leur priorité et leur queue', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.distribution' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '72b7ead3-f69c-4318-a43a-eafd9ebafa9e', 'info.distribution', 'core.queue', 'en', 'Les tâches sont réparties selon leur priorité et leur queue', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.distribution' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'e50e80c4-5b55-44fc-a4b6-79ba41677722', 'info.scaling', 'core.queue', 'fr', 'Les workers peuvent être scalés horizontalement', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.scaling' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7644ed6d-bcea-42f0-87fb-26a606800eed', 'info.scaling', 'core.queue', 'en', 'Les workers peuvent être scalés horizontalement', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.scaling' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a9065f85-67f2-4c08-b48d-4259e799b1a4', 'status.success', 'core.queue', 'fr', 'Succès', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.success' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '4229daf3-d50b-4cd0-b5fa-49c5eec34ee1', 'status.success', 'core.queue', 'en', 'Succès', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.success' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '790c1cab-7395-4eb9-92e6-d56d3ccd047b', 'status.pending', 'core.queue', 'fr', 'En attente', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.pending' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'c7790de5-a5b7-4e69-aab0-26aebafc4888', 'status.pending', 'core.queue', 'en', 'En attente', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.pending' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '1d369c98-b09c-414c-bda9-e7ebe389ece4', 'status.started', 'core.queue', 'fr', 'En cours', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.started' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'c8e02394-8409-4dbb-94eb-e261ce08ba4d', 'status.started', 'core.queue', 'en', 'En cours', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.started' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd4a608b7-62e2-40d9-8205-95ceead4b1d8', 'status.failure', 'core.queue', 'fr', 'Échec', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.failure' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '377778fe-408c-4e1b-b3f1-5f70b2e2196d', 'status.failure', 'core.queue', 'en', 'Échec', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.failure' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '662d2085-7e2b-42b5-bf67-24489f7ff905', 'status.retry', 'core.queue', 'fr', 'Retry', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.retry' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ef66ebd9-974b-4203-8f09-9e5de0dd80a7', 'status.retry', 'core.queue', 'en', 'Retry', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'status.retry' AND namespace_code = 'core.queue')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '2ba7544f-6f03-4073-b808-e85a9a6a3c5d', 'total.label', 'core.metrics', 'fr', 'Total métriques', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'total.label' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7bbd3481-c2fb-43e0-8f98-cc85d6c73e07', 'total.label', 'core.metrics', 'en', 'Total métriques', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'total.label' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'f646b778-feab-477f-85d6-5f5bb44439b1', 'actions.reset', 'core.metrics', 'fr', 'Réinitialiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.reset' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '390893bb-34a4-4779-96f3-59b0caa56c7a', 'actions.reset', 'core.metrics', 'en', 'Réinitialiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'actions.reset' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '239f74af-1fdf-428e-915d-da559ff202c1', 'stats.total', 'core.metrics', 'fr', 'Total métriques', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ebcafff0-abfa-402d-9913-3426513e897d', 'stats.total', 'core.metrics', 'en', 'Total métriques', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd0c74f7c-4c20-49a0-b3a6-abf0f0373e4b', 'stats.total_description', 'core.metrics', 'fr', 'Toutes catégories', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '922532f9-0759-41f2-96b8-2864d619faa7', 'stats.total_description', 'core.metrics', 'en', 'Toutes catégories', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.total_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '31a0a06d-58cc-4d84-acea-3b44cbf9b5bb', 'stats.counters', 'core.metrics', 'fr', 'Compteurs', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.counters' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '69b30b79-2cfc-4194-9429-63efb55c75b8', 'stats.counters', 'core.metrics', 'en', 'Compteurs', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.counters' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'c867f520-9451-471e-84f1-4081eb503ad1', 'stats.counters_description', 'core.metrics', 'fr', 'Métriques cumulatives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.counters_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '8d037d65-45a4-4b77-a81d-821f1164a284', 'stats.counters_description', 'core.metrics', 'en', 'Métriques cumulatives', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.counters_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'dfa35e42-188e-472c-b0aa-d173dfe2f56c', 'stats.gauges', 'core.metrics', 'fr', 'Jauges', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.gauges' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '087e3f42-f063-48ba-81c4-2e7b5f09a285', 'stats.gauges', 'core.metrics', 'en', 'Jauges', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.gauges' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '71669007-df3f-401c-a5b8-03b8182b7b1e', 'stats.gauges_description', 'core.metrics', 'fr', 'Valeurs instantanées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.gauges_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'bb747741-0722-4b25-8b7d-dfec40ba63b3', 'stats.gauges_description', 'core.metrics', 'en', 'Valeurs instantanées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.gauges_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '58a1b586-5937-4b10-93f5-a508a3bf5993', 'stats.histograms', 'core.metrics', 'fr', 'Histogrammes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.histograms' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '198efa78-1c3d-4288-bfde-f175eeccfa47', 'stats.histograms', 'core.metrics', 'en', 'Histogrammes', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.histograms' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '8bf43b6f-295b-41e2-95b1-743238c29396', 'stats.histograms_description', 'core.metrics', 'fr', 'Distributions', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.histograms_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '30438294-4d87-48df-9492-b7d17193632e', 'stats.histograms_description', 'core.metrics', 'en', 'Distributions', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'stats.histograms_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '85be7c07-d653-4f8a-9b1b-2fa7cf274975', 'metrics.title', 'core.metrics', 'fr', 'Métriques disponibles', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.title' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'bed4116c-d2be-4cc5-a713-12c550164c5f', 'metrics.title', 'core.metrics', 'en', 'Métriques disponibles', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.title' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '0ab234f4-8814-4d5b-9ce0-6a0b7d0ae934', 'metrics.description', 'core.metrics', 'fr', 'Vue détaillée de toutes les métriques collectées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '1512a483-1b9c-49b5-b7a0-4744d64c67fe', 'metrics.description', 'core.metrics', 'en', 'Vue détaillée de toutes les métriques collectées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '1b07c810-0c7a-4f42-aaef-1a94595a7418', 'metrics.empty', 'core.metrics', 'fr', 'Aucune métrique collectée', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.empty' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b2bdb02d-a9da-4309-bd4d-ffb26caf599f', 'metrics.empty', 'core.metrics', 'en', 'Aucune métrique collectée', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.empty' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd7ba669d-4eb1-473f-ab55-9dbbd565b6a0', 'metrics.value', 'core.metrics', 'fr', 'Valeur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.value' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '9cb9a829-ffd3-407b-b865-89ebd7c8dd67', 'metrics.value', 'core.metrics', 'en', 'Valeur', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.value' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '65fd80a1-5a0c-4c6b-856a-b8039093a1af', 'metrics.no_data', 'core.metrics', 'fr', 'Aucune donnée', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.no_data' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e07b3914-5e9f-4da1-af54-0f91d0e10da3', 'metrics.no_data', 'core.metrics', 'en', 'Aucune donnée', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.no_data' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '66f733ae-7d96-4bc6-b2d7-1ba988d87679', 'metrics.count', 'core.metrics', 'fr', 'Count', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.count' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '90a72940-1d05-4a50-a522-35b316d4652c', 'metrics.count', 'core.metrics', 'en', 'Count', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.count' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'a97b4683-9388-480d-ad54-ab3143b0cbcb', 'metrics.sum', 'core.metrics', 'fr', 'Sum', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.sum' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b0b417c6-4fe3-4520-939c-0643dea430c5', 'metrics.sum', 'core.metrics', 'en', 'Sum', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.sum' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '665beb5e-9449-45ba-80cb-fb70625986ab', 'metrics.buckets', 'core.metrics', 'fr', 'Buckets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.buckets' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'fc2f2e01-1362-48ff-bb6c-1c4e8cbd0e63', 'metrics.buckets', 'core.metrics', 'en', 'Buckets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'metrics.buckets' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd8314115-524d-4c41-aef4-f55a389afa45', 'info.counters', 'core.metrics', 'fr', 'Compteurs (Counters): Métriques cumulatives qui ne peuvent qu''augmenter', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.counters' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b5ddbe14-76b4-4251-96f0-ed9b10cee4ef', 'info.counters', 'core.metrics', 'en', 'Compteurs (Counters): Métriques cumulatives qui ne peuvent qu''augmenter', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.counters' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '185f91f1-c5db-4722-83e5-15d7e08104b0', 'info.gauges', 'core.metrics', 'fr', 'Jauges (Gauges): Valeurs qui peuvent augmenter ou diminuer', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.gauges' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'b2614e2e-398d-4f88-9f49-784b62cb88ad', 'info.gauges', 'core.metrics', 'en', 'Jauges (Gauges): Valeurs qui peuvent augmenter ou diminuer', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.gauges' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd554dcdf-5dd7-41f2-ab76-0c6e8eb21fc3', 'info.histograms', 'core.metrics', 'fr', 'Histogrammes: Distribution des valeurs avec buckets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.histograms' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'fd073b5b-ad2e-4dbd-ae35-3621c9a74acc', 'info.histograms', 'core.metrics', 'en', 'Histogrammes: Distribution des valeurs avec buckets', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.histograms' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'e09027d9-13ca-44eb-9e57-84380d380177', 'info.prometheus', 'core.metrics', 'fr', 'Les métriques sont exportées au format Prometheus sur /metrics', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.prometheus' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'ba55587f-796e-4c6f-b448-74e562d6c5c9', 'info.prometheus', 'core.metrics', 'en', 'Les métriques sont exportées au format Prometheus sur /metrics', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'info.prometheus' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '79190760-d8bd-43ad-a79f-94e6ec2628d3', 'dialog.reset.title', 'core.metrics', 'fr', 'Réinitialiser les métriques ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.title' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'e13fdb35-1217-4045-9707-c6efa3ab55fb', 'dialog.reset.title', 'core.metrics', 'en', 'Réinitialiser les métriques ?', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.title' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '3a56860b-d70c-4620-b021-c4782a451093', 'dialog.reset.description', 'core.metrics', 'fr', 'Cette action remettra toutes les métriques à zéro. Les données historiques seront perdues. Cette opération est généralement utilisée pour les tests ou le debugging.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'd445ef67-6e52-4903-ad41-e13b79d37d93', 'dialog.reset.description', 'core.metrics', 'en', 'Cette action remettra toutes les métriques à zéro. Les données historiques seront perdues. Cette opération est généralement utilisée pour les tests ou le debugging.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '540544d1-67c7-46c8-bb3e-eff3c3e7ffe7', 'dialog.reset.cancel', 'core.metrics', 'fr', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.cancel' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '4c581176-566a-48a9-90b2-f24833c5b711', 'dialog.reset.cancel', 'core.metrics', 'en', 'Annuler', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.cancel' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'd200410a-3ccb-4837-b575-6c74bef0f63c', 'dialog.reset.confirm', 'core.metrics', 'fr', 'Réinitialiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.confirm' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT 'a774800d-baa3-4c67-b02b-4d54866eea68', 'dialog.reset.confirm', 'core.metrics', 'en', 'Réinitialiser', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.confirm' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '5c8449cc-bd47-4801-b549-84055cf71b0d', 'dialog.reset.resetting', 'core.metrics', 'fr', 'Réinitialisation...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.resetting' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '3fa1eafc-6027-4489-9da0-f98ea981f169', 'dialog.reset.resetting', 'core.metrics', 'en', 'Réinitialisation...', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'dialog.reset.resetting' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT 'b98cfa70-0883-435c-bdc2-334cdc6c004b', 'toast.reset.success', 'core.metrics', 'fr', 'Métriques réinitialisées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.reset.success' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '8e8688c3-7c2e-4b17-9888-30108e063921', 'toast.reset.success', 'core.metrics', 'en', 'Métriques réinitialisées', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.reset.success' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '78514127-1c3a-4836-a83b-05ad6819ea33', 'toast.reset.success_description', 'core.metrics', 'fr', 'Toutes les métriques ont été remises à zéro.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.reset.success_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '7f142098-7a6b-491b-a0ae-8f63c2f12705', 'toast.reset.success_description', 'core.metrics', 'en', 'Toutes les métriques ont été remises à zéro.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.reset.success_description' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, created_at, updated_at)
SELECT '38304f8a-8d0b-43b4-806b-c44567a75553', 'toast.error.reset', 'core.metrics', 'fr', 'Impossible de réinitialiser les métriques.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.reset' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


INSERT INTO translation (id, key, namespace_code, language_code, value, is_approved, true, created_at, updated_at)
SELECT '72e2e8ef-0c51-490b-84d0-fd3cd988a9f2', 'toast.error.reset', 'core.metrics', 'en', 'Impossible de réinitialiser les métriques.', true, NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM translation_key WHERE key = 'toast.error.reset' AND namespace_code = 'core.metrics')
ON CONFLICT (key, namespace_code, language_code) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();


-- Fin du script
-- 127 clés créées
-- 254 traductions créées (FR + EN)
