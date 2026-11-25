import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import orgService from './org.service.js';

class OrgController {
  createOrg = asyncHandler(async (req, res) => {
    const org = await orgService.createOrg(req.body, req.user);
    res.status(201).json({ success: true, message: 'Organization created successfully.', data: org });
  });

  listOrgs = asyncHandler(async (req, res) => {
    const result = await orgService.listOrgs(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  getCurrentOrg = asyncHandler(async (req, res) => {
    const org = await orgService.getCurrentOrg(req.user);
    res.status(200).json({ success: true, data: org });
  });

  getOrgById = asyncHandler(async (req, res) => {
    const org = await orgService.getOrgById(req.params.id, req.user);
    res.status(200).json({ success: true, data: org });
  });

  updateOrg = asyncHandler(async (req, res) => {
    const org = await orgService.updateOrg(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, message: 'Organization updated successfully.', data: org });
  });

  deleteOrg = asyncHandler(async (req, res) => {
    const result = await orgService.deleteOrg(req.params.id, req.user);
    res.status(200).json(result);
  });
}

export default new OrgController();
