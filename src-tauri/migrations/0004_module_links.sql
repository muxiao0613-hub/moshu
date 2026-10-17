-- Platform-owned links keep business modules independent of project/resource internals.
CREATE TABLE platform_module_links(
 module_id TEXT NOT NULL REFERENCES platform_module_states(module_id),entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,role TEXT NOT NULL,
 target_id TEXT NOT NULL,project_id TEXT REFERENCES platform_projects(id) ON DELETE CASCADE,
 resource_id TEXT REFERENCES platform_resources(id) ON DELETE RESTRICT,
 CHECK((project_id IS NOT NULL)+(resource_id IS NOT NULL)=1),CHECK(target_id=coalesce(project_id,resource_id)),
 PRIMARY KEY(module_id,entity_kind,entity_id,role,target_id)
);
CREATE INDEX platform_module_resource_links ON platform_module_links(resource_id);
CREATE INDEX platform_module_project_links ON platform_module_links(project_id);
