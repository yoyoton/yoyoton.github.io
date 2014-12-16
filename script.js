var Tag = AV.Object.extend('Tag');
var Post = AV.Object.extend('Post');
var Comment = AV.Object.extend('Comment');

function logErr(msg, error) {
	if (console && console.error) {
		console.error(msg + " . Error code: " + error.code + " . Error message: " + error.message);
	}
}

// 加载标签
function loadTag() {
	$('#tagPanel').empty();
	var tagElmTmpl = $('#tagTempl').clone().removeAttr('id');
	var qry = new AV.Query(Tag);
	qry.descending('postNum');
	qry.find().then(function(tags) {
		// 更新标签面板
		for (var i = 0; i < tags.length; i++) {
			var tagName = tags[i].get('name');
			if (tagName !== '未分类' && tagName !== '全部') {
				showTag(tagName);
			}			
		}
		showTag('未分类');
		showTag('全部');
	}, function(error) {
		logErr('query tags error.', error);
	});
};

function showTag(tag){
	$('#tagTempl').clone().removeAttr('id').text(tag).appendTo('#tagPanel');
}

// 查询文章
function queryPost(from, size) {
	var query = new AV.Query(Post);
	query.descending('createdTime');
	if (from !== null) {
		query.skip(from);
	}
	if (size !== null) {
		query.limit(size);
	}
	query.find().then(function(posts){
		showPosts(posts);
	},function(error){
		logErr('query posts error.', error);
	});
}

//添加到页面
function showPosts(posts) {
	$('#postList').empty();
	if (!posts || posts.length == 0) {
		$('#newPostItem').addClass('bottom-radius');
		return;
	} else {
		$('#newPostItem').removeClass('bottom-radius');
	}
	for (var i = 0; i < posts.length; i++) {
		var postElm = $('#postItemTempl').clone().removeAttr('id').data('postId', posts[i].id).appendTo('#postList');
		postElm.find('.post-box-container').html(posts[i].get('html'));
		if (i == 0) {// 标记第一个post
			postElm.addClass('first-post-item');
		}
		if (i == posts.length - 1) {// 最后一篇post,有可能也是第一个post.
			postElm.addClass('last-post-item');
		}
	}
}

// 查找标签下的全部文章
function loadPostOfTag(tagName) {
	if (tagName === '全部') {
		queryPost();
		return;
	}
	var tagQry = new AV.Query(Tag);
	tagQry.equalTo("name", tagName);
	tagQry.first().then(function(object) {
		if (!object) {
			return;
		}
		var postIdsArr = object.get('postId');
		var postIdsStr = postIdsArr.join('","');
		var cql = 'select html,id from Post where objectId in ( "' + postIdsStr + '" ) order by createdTime desc';
		AV.Query.doCloudQuery(cql, {
			success : function(result) {
				showPosts(result.results);
			},
			error : function(error) {
				logErr('query post by tag failed.', error);
			}
		})
	}, function(error) {
		logErr('query tag failed.', error);
	})
}

function savePost(text, html) {
	var post = new Post();
	post.set('text', text);
	post.set('html', html);
	post.set('createdTime', (new Date()).getTime());
	post.save(null, {
		success : function(post) {
			savePostSucceedFn(post, text, html);
		},
		error : function(post, error) {
			logErr('save post failed.', error);
		}
	});
}

function savePostSucceedFn(post, text, html){
	$('#createPostBtn').text('保存');
	$('#newPostItem .post-box').html('').removeClass('write-post-box-shadow').blur();
	$('#newPostItem .box-container').addClass('hide');
	$('#newPostItem .toolbar').addClass('hide');
	$('#newPostItem .placeholder').removeClass('hide');
	$('#postList .post-item').removeClass('opacity01');
	$('#postItemTempl').clone().removeAttr('id').prependTo('#postList')
	.find('.post-box-container').html(html);

	// 匹配标签,双#号之间1到15个非空白字符
	var reg = /#\S{1,15}#/g;
	var tags = text.match(reg);
	if (!tags || tags.length == 0) {
		tags = [ '#未分类#' ];
	}
	saveTags(tags, post.id);
}

function saveTags(tags, postId) {

	if (!tags || tags.length == 0) {
		return;
	}
	// 取最后一个,并去除前后#号,过滤掉'全部'标签
	var tagName = null;
	while ((tagName = tags.pop().slice(1, -1)) == '全部') {
		continue;
	}
	var query = new AV.Query(Tag);
	query.equalTo('name', tagName);
	query.find().then(function(results) {
		// topic已存在
		if (results !== null && results.length > 0) {
			var tag = results[0];
			tag.add('postId', postId);
			tag.set('postNum', (tag.get('postNum') || 0) + 1);
			return tag.save();
			// topic不存在
		} else {
			var tag = new Tag();
			tag.set('name', tagName);
			tag.set('postId', [ postId ]);
			tag.set('postNum', 1);
			return tag.save(null, {
				success : function(tag) {
					console.log('create new tag succeed: ' + tag.id);
				}
			});
		}
	}).then(function() {
		console.log("save tag succeed");
		// 递归调用
		return saveTags(tags, postId)
	}, function(error) {
		logErr('save tag error. ', error);
	}).then(function() {
		// 重新加载标签
		return loadTag();
	}).then(function() {
		console.log('query tags succeed');
	}, function(error) {
		logErr('query tags ', error);
	});
}

function deletePost(postId, succeedFn){
	var qry = new AV.Query(Post);
	qry.get(postId).then(function(post){
		return post.destroy();
	}, function(object, error){
		logErr('query post failed');
	}).then(function(post){
		succeedFn();
	}, function(object, error){
		logErr('delete post failed')
	})
}

function createComment(text, html, postId, succeedFn) {
	var comment = new Comment();
	comment.set('text', text);
	comment.set('html', html);
	comment.set('postId', postId);
	comment.set('createdTime', (new Date()).getTime());
	comment.save(null).then(function(comment){
		succeedFn(comment.id);
	},function(comment, error){
		logErr('save comment error ', error);
	});
}

function queryComment(postId, succeedFn, failedFn) {
	var qry = new AV.Query(Comment);
	qry.equalTo('postId', postId);
	qry.find().then(function(results) {
		succeedFn(results);
	}, function(error) {
		failedFn(error);
	})
}

function isBoxEmpty(box) {
	var text = $(box).text();
	var html = $(box).html();
	if (text.trim() === "" && html.indexOf('<img') < 0 && html.indexOf('<audio') < 0 && html.indexOf('<video') < 0) {
		return true;
	} else {
		return false;
	}
}

function getPostId(elm) {
	return $(elm).closest('.post-item').data('postId');
}

function getCommentList(elm){
	return $(elm).closest('.post-item').find('.comment-list');
}

function registEvent() {

	$('#tagPanel').on({
		click : function() {
			loadPostOfTag($(this).text());
		}
	}, ".tag");

	$('#newPostItem .placeholder').click(function() {			
		$(this).addClass('hide');
		$('#newPostItem .box-container').removeClass('hide')
		$('#newPostItem .post-box').attr('contentEditable', 'true').focus().addClass('write-post-box-shadow');
		$('#newPostItem .toolbar').removeClass('hide');
		$('#postList .post-item').addClass('opacity01');
	});

	$('#newPostItem .post-box').blur(function() {
		if (isBoxEmpty(this)) {
			$(this).parent().addClass('hide');
			$('#newPostItem .toolbar').addClass('hide');
			$('#newPostItem .placeholder').removeClass('hide');
			$('#newPostItem .post-box').addClass('top-radius').removeClass('write-post-box-shadow');
			$('#postList .post-item').removeClass('opacity01');
		}
	}).keyup(function(e) {
		if (isBoxEmpty(this)) {
			$('#createPostBtn').prop('disabled', true);
		} else {
			$('#createPostBtn').prop('disabled', false);
			if (e.ctrlKey && e.which == 13) {
				$('#createPostBtn').click();
			}
		}
	});

	$('#createPostBtn').click(function() {
		$(this).text('正在保存');
		$('#newPostItem .post-box').attr('contentEditable', 'false').removeClass('write-post-box-shadow').removeClass('top-radius');
		savePost($('#newPostBoxContainer').text(), $('#newPostBoxContainer').html());
	});

	$('#postList').on({
		click : function() {
			var _this = this;
			$(this).parent().next().toggleClass('hide');
			if($(this).data('queryed')){
				return;
			};
			var postId = queryComment(getPostId(this), function(comments) {
				$(_this).data('queryed', true);
				var commentList = getCommentList(_this);				
				for(var i=0; i<comments.length; i++){
					var commentId = comments[i].id;
					var html = comments[i].get('html');
					$('#commentItemTempl').clone().removeAttr('id').data('commentId', comments[i].id)
					.find('.comment-box-container').html(comments[i].get('html')).end()
					.appendTo(commentList);
				}				
			}, function(error) {
				logErr('query comments failed.', error);
			});
		}
	}, 'span.comment');
	
	$('#postList').on({
		click:function(){
			
			var _this = this;
			if(confirm('您确定要删除吗')){
				deletePost(getPostId(this), function(){
					$(_this).closest('.post-item').remove();
				})
			}
		}
	}, 'span.delete')
	
	$('#postList').on({
		click: function(){
			$(this).next().next().toggleClass('hide').next().toggleClass('hide');
		}
	}, 'span.more');

	$('#postList').on({
		click : function() {
			$(this).addClass('hide').siblings().removeClass('hide').end().next().children().focus();
		}
	}, '.new-comment-item .placeholder');

	$('#postList').on({
		keyup : function(e) {
			var createCommentBtn = $(this).closest('.post-item').find('.create-comment-btn');
			if (isBoxEmpty(this)) {
				createCommentBtn.prop('disabled', true);
			} else {
				createCommentBtn.prop('disabled', false);
				if (e.ctrlKey && e.which == 13) {
					createCommentBtn.click();
				}
			}
		}
	}, '.new-comment-item .comment-box');

	$('#postList').on(
			{
				click : function() {
					var btn = $(this).text('正在保存');
					var commentList = $(this).closest('.post-item').find('.comment-list');
					
					var boxContainer = $(this).closest('.post-item').find('.new-comment-item .comment-box-container');
					var commentBox = boxContainer.find('.comment-box');
					var postId = $(this).closest('.post-item').data('postId');
					createComment(boxContainer.text(), boxContainer.html(), postId, function(commentId) {

						$('#commentItemTempl').clone().removeAttr('id').data('commentId', commentId).find('.comment-box-container').html(boxContainer.html()).end()
								.appendTo(commentList);
						commentBox.html('').parent().addClass('hide').next().addClass('hide').prev().prev().removeClass('hide');
						btn.text('保存').prop('disabled', true);
					});
				}
			}, '.create-comment-btn');

}
