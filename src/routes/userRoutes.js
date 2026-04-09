const express = require('express');
const router = express.Router();
const { 
  getAllUsers,
  getProfile, 
  updateProfile, 
  uploadProfilePic,
  uploadGalleryImages,
  deleteGalleryImage,
  toggleGalleryLike,
  addGalleryComment,
  getUserById,
  followUser,
  unfollowUser,
  blockUser,
  unblockUser
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/', protect, getAllUsers);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/upload-profile-pic', protect, upload.single('profilePic'), uploadProfilePic);
router.post('/gallery', protect, upload.array('gallery', 12), uploadGalleryImages);
router.delete('/gallery', protect, deleteGalleryImage);
router.post('/gallery/:mediaId/like', protect, toggleGalleryLike);
router.post('/gallery/:mediaId/comment', protect, addGalleryComment);

router.post('/:id/follow', protect, followUser);
router.post('/:id/unfollow', protect, unfollowUser);
router.post('/:id/block', protect, blockUser);
router.post('/:id/unblock', protect, unblockUser);

router.get('/:id', protect, getUserById);

module.exports = router;
