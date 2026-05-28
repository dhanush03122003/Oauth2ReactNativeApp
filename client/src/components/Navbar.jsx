import { Link, useLocation } from 'react-router-dom';

function Navbar({ user, onLogout }) {
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2 group">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center group-hover:bg-slate-800 transition-colors shadow-sm">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">WebAuthn</span>
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            {user ? (
              <>
                <span className="text-sm font-medium text-gray-500">Welcome, <span className="text-gray-900">{user.username}</span></span>
                <div className="w-px h-4 bg-gray-200 mx-2"></div>
                <button
                  onClick={onLogout}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-slate-900 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2 bg-gray-50/50 p-1 rounded-lg border border-gray-100">
                <Link
                  to="/login"
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                    path === '/login'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-gray-200/50'
                      : 'text-gray-500 hover:text-slate-900 hover:bg-gray-100/50'
                  }`}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                    path === '/register'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-gray-200/50'
                      : 'text-gray-500 hover:text-slate-900 hover:bg-gray-100/50'
                  }`}
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
