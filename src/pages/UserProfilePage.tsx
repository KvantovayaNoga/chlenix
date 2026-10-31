import { useParams, useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Mail, Shield, Calendar, Edit, User as UserIcon, Upload, X, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { AvatarUpload } from '../components/AvatarUpload';

const roleLabels = {
  admin: 'Администратор',
  materially_responsible: 'Материально ответственное лицо',
  viewer: 'Пользователь',
};

export function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { users, currentUser, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ fullName: '', email: '', password: '', avatar: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const user = users.find(u => u.id === id);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setDrawStart({ x, y });
    setCropBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const width = currentX - drawStart.x;
    const height = currentY - drawStart.y;
    
    setCropBox({
      x: width < 0 ? currentX : drawStart.x,
      y: height < 0 ? currentY : drawStart.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleCrop = () => {
    if (!cropImage || !canvasRef.current || cropBox.width === 0 || cropBox.height === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const containerWidth = 400;
      const containerHeight = 400;
      const scale = Math.min(containerWidth / img.width, containerHeight / img.height);
      
      const sourceX = cropBox.x / scale;
      const sourceY = cropBox.y / scale;
      const sourceWidth = cropBox.width / scale;
      const sourceHeight = cropBox.height / scale;

      canvas.width = 200;
      canvas.height = 200;
      
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, 200, 200
      );

      const croppedAvatar = canvas.toDataURL('image/jpeg', 0.9);
      updateUser(user.id, { avatar: croppedAvatar });
      setShowCropModal(false);
      setCropImage(null);
    };
    img.src = cropImage;
  };

  const handleCancelCrop = () => {
    setShowCropModal(false);
    setCropImage(null);
    setCropBox({ x: 0, y: 0, width: 0, height: 0 });
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDrawing(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-800 dark:text-gray-800 dark:text-gray-200 mb-6">
        <ArrowLeft className="w-5 h-5" />
        <span>Назад</span>
      </button>

      <div className="max-w-2xl">
        <div className="bg-white dark:bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-200 dark:border-gray-700">
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
                      const img = new Image();
                      img.onload = () => {
                        // Создаем canvas для кадрирования
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;
                        
                        // Показываем модальное окно для кадрирования
                        setCropImage(event.target?.result as string);
                        setShowCropModal(true);
                      };
                      img.src = event.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-800 dark:text-gray-200">{user.fullName}</h1>
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
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-2">Аватар</label>
                <AvatarUpload
                  currentAvatar={editData.avatar}
                  onAvatarChange={(avatar) => setEditData({ ...editData, avatar })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">ФИО</label>
                <input
                  type="text"
                  value={editData.fullName}
                  onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-800 dark:text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-800 dark:text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Новый пароль (оставьте пустым, чтобы не менять)</label>
                <input
                  type="password"
                  value={editData.password}
                  onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-800 dark:text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={handleSave} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Сохранить
                </button>
                <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 border border-gray-600 rounded-lg text-gray-600 dark:text-gray-600 dark:text-gray-300 hover:bg-gray-700">
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Mail className="w-4 h-4" />
                    Email
                  </div>
                  <p className="text-gray-800 dark:text-gray-800 dark:text-gray-200">{user.email}</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Shield className="w-4 h-4" />
                    Роль
                  </div>
                  <p className="text-gray-800 dark:text-gray-800 dark:text-gray-200">{roleLabels[user.role]}</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Calendar className="w-4 h-4" />
                    Дата создания
                  </div>
                  <p className="text-gray-800 dark:text-gray-800 dark:text-gray-200">{new Date(user.createdAt).toLocaleDateString('ru-RU')}</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
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

      {/* Модальное окно кадрирования */}
      {showCropModal && cropImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-800 dark:text-gray-200">Кадрирование аватара</h3>
              <button
                onClick={handleCancelCrop}
                className="text-gray-400 hover:text-gray-800 dark:text-gray-800 dark:text-gray-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div 
              ref={containerRef}
              className="relative bg-gray-700 rounded-lg overflow-hidden cursor-crosshair select-none mx-auto"
              style={{ width: '400px', height: '400px' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <img
                src={cropImage}
                alt="Crop preview"
                className="absolute"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                draggable={false}
              />
              {cropBox.width > 0 && cropBox.height > 0 && (
                <div
                  className="absolute border-2 border-white shadow-lg pointer-events-none"
                  style={{
                    left: `${cropBox.x}px`,
                    top: `${cropBox.y}px`,
                    width: `${cropBox.width}px`,
                    height: `${cropBox.height}px`,
                  }}
                >
                  <div className="absolute inset-0 bg-white/10"></div>
                </div>
              )}
            </div>
            
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCrop}
                disabled={cropBox.width === 0 || cropBox.height === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                Применить
              </button>
              <button
                onClick={handleCancelCrop}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Отмена
              </button>
            </div>
            
            <p className="text-xs text-gray-400 text-center mt-3">
              Нарисуйте квадрат мышью для выбора области аватара
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
