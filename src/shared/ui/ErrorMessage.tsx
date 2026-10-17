import type { AppError } from '../../contracts';

export function ErrorMessage({ error, retry }: { error: AppError | null; retry?: () => void }) {
  if (!error) return null;
  return <div className="error-message" role="alert">
    <p>{error.message}</p><small>错误编号：{error.code}</small>
    {retry && <button type="button" onClick={retry}>重试</button>}
  </div>;
}
