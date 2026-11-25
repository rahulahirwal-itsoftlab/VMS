import api from '../api/axios';

/**
 * Service to manage organizations and multi-tenancy.
 */

export const getCurrentOrg = async () => {
  const res = await api.get('/v1/orgs/current');
  return res.data?.data;
};

export const listOrgs = async (params = {}) => {
  const res = await api.get('/v1/orgs', { params });
  return res.data;
};

export const getOrgById = async (id) => {
  const res = await api.get(`/v1/orgs/${id}`);
  return res.data?.data;
};

export const createOrg = async (data) => {
  const res = await api.post('/v1/orgs', data);
  return res.data?.data;
};

export const updateOrg = async (id, data) => {
  const res = await api.put(`/v1/orgs/${id}`, data);
  return res.data?.data;
};

export const deleteOrg = async (id) => {
  const res = await api.delete(`/v1/orgs/${id}`);
  return res.data;
};

export default {
  getCurrentOrg,
  listOrgs,
  getOrgById,
  createOrg,
  updateOrg,
  deleteOrg,
};
