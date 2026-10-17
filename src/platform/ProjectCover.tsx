import { useEffect, useState } from 'react';
import type { Project } from '../contracts';
import { command } from '../shared/lib/bridge';

export function ProjectCover({ project }: { project: Project }) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (project.coverBlobId) void command('preview_project_cover', { id: project.id }).then(preview => {
      if (active) { setImage(preview.dataUrl); setFailed(!preview.dataUrl); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [project.id, project.coverBlobId]);
  if (!project.coverBlobId) return null;
  return image ? <img className="project-cover" src={image} alt={`${project.name}的封面`} /> : failed ? <p className="muted">封面暂不可预览</p> : null;
}
