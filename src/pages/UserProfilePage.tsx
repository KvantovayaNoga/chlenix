import { useParams, useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Mail, Shield, Calendar, Edit, User as UserIcon, Upload, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { AvatarUpload } from '../components/AvatarUpload';
import { AvatarCropper } from '../components/AvatarCropper';

const roleLabels = {
  admin: 'Администратор',
  materially_responsible: 'Материально ответственное лицо',
  viewer: 'Пользователь',
};

export function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { users, currentUser, updateUser, refreshUsers } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ fullName: '', email: '', password: '', avatar: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  const user = users.find(u => u.id === id);

  // Если список ещё не загружен (например, прямой заход по ссылке) — подтягиваем его.
  useEffect(() => {
    if (!user && users.length === 0) void refreshUsers();
  }, [user, users.length, refreshUsers]);

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Пользователь не найден</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline">
          Вернуться назад
        </button>
      </div>
    );
  }

  const canEdit = currentUser?.id === user.id || currentUser?.role === 'admin';

  const handleEdit = () => {
    setEditData({ fullName: user.fullName, email: user.email, password: '', avatar: user.avatar || '' });
    setIsEditing(true);
  };

  const handleSave = () => {
    const updates: any = { fullName: editData.fullName, email: editData.email, avatar: editData.avatar || undefined };
    if (editData.password) {
      updates.password = editData.password;
    }
    updateUser(user.id, updates);
    setIsEditing(false);
  };

  const applyCroppedAvatar = (cropped: string) => {
    updateUser(user.id, { avatar: cropped });
    setShowCropModal(false);
    setCropImage(null);
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-800 dark:text-gray-200 mb-6">
        <ArrowLeft className="w-5 h-5" />
        <span>Назад</span>
      </button>

      <div className="max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                {user.avatar ? (
                  <>
                    <img 
                      src={user.avatar} 
                      alt={user.fullName} 
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-600"
                    />
                    {canEdit && (
                      <div 
                        className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </>
                ) : (
                  <div 
                    className={`w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center text-2xl font-bold text-white ${canEdit ? 'cursor-pointer hover:bg-slate-600' : ''}`}
                    onClick={() => {
                      if (canEdit) {
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    {user.fullName.charAt(0)}
                    {canEdit && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setCropImage(event.target?.result as string);
                      setShowCropModal(true);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">{user.fullName}</h1>
                <p className="text-gray-400 mt-1">{user.email}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                  user.role === 'admin' ? 'bg-red-100 text-red-700' :
                  user.role === 'materially_responsible' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  <Shield className="w-3 h-3 inline mr-1" />
                  {roleLabels[user.role]}
                </span>
              </div>
            </div>
            {canEdit && !isEditing && (
              <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                <Edit className="w-4 h-4" />
                Редактировать
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Аватар</label>
                <AvatarUpload
                  currentAvatar={editData.avatar}
                  onAvatarChange={(avatar) => setEditData({ ...editData, avatar })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">ФИО</label>
                <input
                  type="text"
                  value={editData.fullName}
                  onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Новый пароль (оставьте пустым, чтобы не менять)</label>
                <input
                  type="password"
                  value={editData.password}
                  onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={handleSave} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Сохранить
                </button>
                <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Mail className="w-4 h-4" />
                    Email
                  </div>
                  <p className="text-gray-800 dark:text-gray-200">{user.email}</p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Shield className="w-4 h-4" />
                    Роль
                  </div>
                  <p className="text-gray-800 dark:text-gray-200">{roleLabels[user.role]}</p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    Дата создания
                  </div>
                  <p className="text-gray-800 dark:text-gray-200">{new Date(user.createdAt).toLocaleDateString('ru-RU')}</p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <UserIcon className="w-4 h-4" />
                    Статус
                  </div>
                  <p className={user.isActive ? 'text-green-400' : 'text-red-400'}>
                    {user.isActive ? 'Активен' : 'Заблокирован'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модалка кадрирования: WYSIWYG — сохраняем ровно то, что видно в рамке */}
      {showCropModal && cropImage && (
        <AvatarCropper
          imageSrc={cropImage}
          onCrop={applyCroppedAvatar}
          onCancel={() => { setShowCropModal(false); setCropImage(null); }}
        />
      )}
    </div>
  );
}
