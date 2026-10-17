/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {Link} from 'react-router-dom';
import {Settings} from 'lucide-react';
export function UserMenu(){return <Link to="/settings" title="本地空间设置" className="p-2 text-zinc-300 hover:text-white"><Settings size={17}/></Link>;}
