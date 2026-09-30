/**
 * routes/admin.js — every route below requires a valid admin JWT.
 */
import { Router } from "express";
import * as ctl from "../controllers/adminController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadMany } from "../middleware/upload.js";

const router = Router();

router.use(requireAuth);

/* ---- dashboard ---- */
router.get("/stats", ctl.stats);
router.get("/analytics", ctl.analyticsReport);

/* ---- enquiries ---- */
router.get("/enquiries", ctl.listEnquiries);
router.get("/enquiries/export", ctl.exportEnquiries);
router.get("/enquiries/:id", ctl.getEnquiry);
router.patch("/enquiries/:id", ctl.setEnquiryStatus);
router.patch("/enquiries/:id/notes", ctl.setEnquiryNotes);
router.delete("/enquiries/:id", ctl.removeEnquiry);

/* ---- reviews ---- */
router.get("/reviews", ctl.listReviews);
router.patch("/reviews/:id", ctl.moderateReview);
router.delete("/reviews/:id", ctl.removeReview);

/* ---- customer uploads ---- */
router.get("/uploads", ctl.listUploads);
router.patch("/uploads/:id", ctl.moderateUpload);
router.delete("/uploads/:id", ctl.removeUpload);

/* ---- taxonomy: builds the homepage section/heading structure ---- */
router.get("/taxonomy", ctl.listTaxonomy);
router.post("/taxonomy/reorder", ctl.reorderTaxonomy);
router.post("/categories", ctl.createCategory);
router.patch("/categories/:id", ctl.updateCategory);
router.delete("/categories/:id", ctl.removeCategory);
router.post("/subcategories", ctl.createSubcategory);
router.patch("/subcategories/:id", ctl.updateSubcategory);
router.delete("/subcategories/:id", ctl.removeSubcategory);

/* ---- designs ---- */
router.get("/designs", ctl.listDesigns);
router.post("/designs", ctl.createDesign);
router.get("/designs/:id", ctl.getDesign);
router.patch("/designs/:id", ctl.updateDesign);
router.delete("/designs/:id", ctl.removeDesign);
router.post("/designs/:id/images", uploadMany, ctl.addDesignImages);
router.delete("/designs/:id/images/:mediaId", ctl.removeDesignImage);
router.patch("/designs/:id/images/reorder", ctl.reorderDesignImages);

/* ---- gallery ---- */
router.get("/gallery", ctl.listGallery);
router.post("/gallery", ctl.createGalleryItem);
router.patch("/gallery/:id", ctl.updateGalleryItem);
router.delete("/gallery/:id", ctl.removeGalleryItem);

/* ---- events ---- */
router.get("/events", ctl.listEvents);
router.post("/events", ctl.createEvent);
router.patch("/events/:id", ctl.updateEvent);
router.delete("/events/:id", ctl.removeEvent);

/* ---- media library ---- */
router.get("/media", ctl.listMedia);
router.post("/media", uploadMany, ctl.uploadMedia);
router.patch("/media/:id", ctl.updateMediaMeta);
router.delete("/media/:id", requireRole("admin"), ctl.removeMedia);

/* ---- social video ---- */
router.get("/videos", ctl.listVideos);
router.post("/videos", ctl.createVideo);
router.patch("/videos/:id", ctl.updateVideo);
router.delete("/videos/:id", ctl.removeVideo);

/* ---- instagram ---- */
router.get("/instagram", ctl.listInstagram);
router.post("/instagram", ctl.createInstagramPost);
router.patch("/instagram/:id", ctl.updateInstagramPost);
router.delete("/instagram/:id", ctl.removeInstagramPost);

/* ---- social links ---- */
router.get("/social", ctl.listSocialLinks);
router.post("/social", ctl.createSocialLink);
router.patch("/social/:id", ctl.updateSocialLink);
router.delete("/social/:id", ctl.removeSocialLink);

export default router;
