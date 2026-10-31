import { useState, useRef, useEffect } from 'react';
import { useDataStore } from '../store/dataStore';
import { Search, X } from 'lucide-react';
import type { Employee } from '../types';

interface EmployeeSearchProps {
  value: string | null;
  onChange: (employeeId: string | null) => void;
  label: string;
  placeholder?: string;
}

export function EmployeeSearch({ value, onChange, label, placeholder = 'Поиск сотрудника...' }: EmployeeSearchProps) {
  const { employees } = useDataStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activeEmployees = employees.filter(e => e.isEmployed);
  
  const selectedEmployee = value ? activeEmployees.find(e => e.id === value) : null;

  const filteredEmployees = activeEmployees.filter(emp => {
    const q = searchQuery.toLowerCase();
    return (
      emp.lastName.toLowerCase().includes(q) ||
      emp.firstName.toLowerCase().includes(q) ||
      emp.middleName?.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.positionId.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (employee: Employee) => {
    onChange(employee.id);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      
      {selectedEmployee ? (
        <div className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-800 dark:text-gray-800 dark:text-gray-200">
              {selectedEmployee.lastName} {selectedEmployee.firstName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEmployee.email}</p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-red-500 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-800 dark:text-gray-800 dark:text-gray-200"
          />
        </div>
      )}

      {isOpen && !selectedEmployee && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredEmployees.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              Сотрудники не найдены
            </div>
          ) : (
            filteredEmployees.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleSelect(emp)}
                className="w-full text-left p-3 hover:bg-indigo-50 dark:hover:bg-gray-600 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
              >
                <p className="text-sm font-medium text-gray-800 dark:text-gray-800 dark:text-gray-800 dark:text-gray-200">
                  {emp.lastName} {emp.firstName} {emp.middleName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{emp.email}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
