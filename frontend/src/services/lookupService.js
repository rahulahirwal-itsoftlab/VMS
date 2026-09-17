import api from '../api/axios';

/**
 * Fetch role lookup options.
 * @returns {Promise<Array<{id: string, name: string, value: string}>>}
 */
export const getRolesLookup = async () => {
  const res = await api.get('/v1/lookups/roles');
  return res.data.data || [];
};

/**
 * Fetch active, approved vendors for selectors.
 * @param {string} [search] - Optional query string search.
 * @returns {Promise<Array<{id: string, name: string, value: string}>>}
 */
export const getVendorsLookup = async (search = '') => {
  const params = search ? { search } : {};
  const res = await api.get('/v1/lookups/vendors', { params });
  return res.data.data || [];
};

/**
 * Fetch active manager-role lookup options.
 * @param {string} [search] - Optional query string search.
 * @returns {Promise<Array<{id: string, name: string, email: string, value: string}>>}
 */
export const getManagersLookup = async (search = '') => {
  const params = search ? { search } : {};
  const res = await api.get('/v1/lookups/managers', { params });
  return res.data.data || [];
};

/**
 * Fetch teams list.
 */
export const getTeamsLookup = async () => {
  const res = await api.get('/v1/lookups/teams');
  return res.data.data || [];
};

/**
 * Fetch branches list.
 */
export const getBranchesLookup = async () => {
  const res = await api.get('/v1/lookups/branches');
  return res.data.data || [];
};

/**
 * Fetch regions list from real user profile values.
 */
export const getRegionsLookup = async () => {
  const res = await api.get('/v1/lookups/regions');
  return res.data.data || [];
};

/**
 * Fetch designations list.
 */
export const getDesignationsLookup = async () => {
  const res = await api.get('/v1/lookups/designations');
  return res.data.data || [];
};
