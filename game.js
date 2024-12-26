// 游戏状态常量
const GAME_STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  VICTORY: 'victory',
  VICTORY_WAITING: 'victory_waiting',  // 添加胜利等待状态
  DEFEAT: 'defeat',
  DEFEAT_WAITING: 'defeat_waiting'  // 添加失败等待状态
}

// 资源加载
const images = {
  bg: null,
  player: null,
  arrow: null,
  monster: null,
  boom: null
}

// 游戏主类
class Game {
  constructor() {
    // 初始化画布
    this.canvas = wx.createCanvas()
    this.ctx = this.canvas.getContext('2d')
    
    // 获取屏幕尺寸
    const systemInfo = wx.getSystemInfoSync()
    this.screenWidth = systemInfo.windowWidth
    this.screenHeight = systemInfo.windowHeight
    
    // 设置画布尺寸
    this.canvas.width = this.screenWidth
    this.canvas.height = this.screenHeight

    // 初始化游戏状态
    this.state = GAME_STATE.TITLE

    // 加载游戏配置
    this.loadGameConfig()

    // 初始化玩家
    this.player = {
      x: 0,
      y: 0,
      width: this.gameConfig.playerBaseStats.width,
      height: this.gameConfig.playerBaseStats.height,
      isDragging: false,
      exp: 0,
      arrowSpeedMultiplier: 1,
      killCount: 0
    }

    // 初始化游戏变量
    this.arrows = []
    this.monsters = []
    this.lastArrowTime = 0
    this.lastMonsterTime = 0
    this.arrowInterval = this.gameConfig.playerBaseStats.baseArrowInterval
    this.monsterInterval = 333
    this.explosions = []
    this.defeatTimer = 0
    this.victoryTimer = 0

    // 加载资源
    this.loadResources()
    
    // 注册事件监听
    this.bindEvents()

    // 开始游戏循环
    this.gameLoop()

    // 添加调试模式
    this.debugMode = true
  }

  // 加载图片资源
  loadResources() {
    // 加载背景图
    images.bg = wx.createImage()
    images.bg.src = 'images/imgs/bg.jpg'
    
    // 加载玩家图片
    images.player = wx.createImage()
    images.player.src = 'images/imgs/player.png'

    // 修改武器图片加载
    images.arrow = wx.createImage()
    images.arrow.src = 'images/imgs/bullet.png'

    // 加载怪物图片
    images.monster = wx.createImage()
    images.monster.src = 'images/imgs/monster.png'

    // 加载爆炸效果图片
    images.boom = wx.createImage()
    images.boom.src = 'images/imgs/boom.png'
  }

  // 绑定事件
  bindEvents() {
    wx.onTouchStart((e) => {
      const touch = e.touches[0]
      
      console.log('Touch event:', this.state)  // 添加调试日志
      
      if (this.state === GAME_STATE.TITLE) {
        console.log('Starting game...')  // 添加调试日志
        this.initPlayer()
        this.state = GAME_STATE.PLAYING
        return
      }

      if (this.state === GAME_STATE.VICTORY) {
        const buttonY = this.screenHeight / 2 + 150
        const buttonX = this.screenWidth / 2
        if (Math.abs(touch.clientY - buttonY) < 30 &&
            Math.abs(touch.clientX - buttonX) < 50) {
          // 点击继续后进入等待状态
          this.state = GAME_STATE.VICTORY_WAITING
          this.victoryTimer = Date.now()
        }
        return
      }

      if (this.state === GAME_STATE.DEFEAT_WAITING) {
        // 检查是否点击了重新开始按钮
        const buttonY = this.screenHeight / 2 + 100
        if (Math.abs(touch.clientY - buttonY) < 20) {
          this.restartGame()
        }
        return
      }

      // 游戏中的拖动逻辑
      if (this.state === GAME_STATE.PLAYING && this.isPointInPlayer(touch.clientX, touch.clientY)) {
        this.player.isDragging = true
      }
    })

    // 保持其他触摸事件处理不变
    wx.onTouchMove((e) => {
      if (this.player.isDragging) {
        const touch = e.touches[0]
        this.player.x = Math.min(
          Math.max(touch.clientX - this.player.width / 2, 0),
          this.screenWidth - this.player.width
        )
        this.player.y = Math.min(
          Math.max(touch.clientY - this.player.height / 2, 0),
          this.screenHeight - this.player.height
        )
      }
    })

    wx.onTouchEnd(() => {
      this.player.isDragging = false
    })
  }

  // 检查点是否在玩家精灵内
  isPointInPlayer(x, y) {
    return (
      x >= this.player.x &&
      x <= this.player.x + this.player.width &&
      y >= this.player.y &&
      y <= this.player.y + this.player.height
    )
  }

  // 绘制标题界面
  drawTitle() {
    this.ctx.fillStyle = '#1a1a1a'
    this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight)
    
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = 'bold 24px Arial'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    this.ctx.shadowBlur = 5
    
    this.ctx.fillText('草原斩魂', this.screenWidth / 2, this.screenHeight / 2)
  }

  // 添加计算最近怪物的方法
  findNearestMonster() {
    let nearestMonster = null
    let minDistance = Infinity

    this.monsters.forEach(monster => {
      const dx = monster.x - (this.player.x + this.player.width/2)
      const dy = monster.y - (this.player.y + this.player.height/2)
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < minDistance) {
        minDistance = distance
        nearestMonster = monster
      }
    })

    return nearestMonster
  }

  // 修改发射箭的方法
  shootArrow() {
    const currentTime = Date.now()
    if (currentTime - this.lastArrowTime >= this.arrowInterval) {
      const nearestMonster = this.findNearestMonster()
      
      if (nearestMonster) {
        // 计算主人公中心点
        const playerCenterX = this.player.x + this.player.width/2
        const playerCenterY = this.player.y + this.player.height/2
        
        // 计算方向向量
        const dx = nearestMonster.x - playerCenterX
        const dy = nearestMonster.y - playerCenterY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        const directionX = dx / distance
        const directionY = dy / distance

        const levelMultiplier = 1 + (this.gameConfig.level - 1) * 0.1
        
        this.arrows.push({
          x: playerCenterX,                // 从主人公中心发射
          y: playerCenterY,                // 从主人公中心发射
          width: this.gameConfig.weaponStats.width,
          height: this.gameConfig.weaponStats.height,
          speed: this.gameConfig.weaponStats.speed * levelMultiplier,
          damage: Math.ceil(this.gameConfig.weaponStats.damage * levelMultiplier),
          directionX: directionX,
          directionY: directionY,
          angle: Math.atan2(directionY, directionX) + Math.PI/2  // 保存箭的角度
        })
        this.lastArrowTime = currentTime
      }
    }
  }

  // 添加碰撞检测方法
  checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    )
  }

  // 修改经验值处理方法，添加击杀计数
  addExperience() {
    this.player.exp += 1
    this.player.killCount += 1

    // 检查是否达到胜利条件
    if (this.player.killCount >= 100) {
      this.state = GAME_STATE.VICTORY
      return
    }
    
    // 检查是否达到升级条件
    if (this.player.exp > 1 && this.player.exp % 10 === 0) {
      this.levelUp()
    }
  }

  // 修改升级处理方法
  levelUp() {
    // 计算等级（每10点经验一级）
    const level = Math.floor(this.player.exp / 10)
    
    // 每级增加30%攻击速度（1 + 0.3 * level）
    this.player.arrowSpeedMultiplier = 1 + (level * 0.3)
    
    // 更新射箭间隔
    this.arrowInterval = this.gameConfig.playerBaseStats.baseArrowInterval / this.player.arrowSpeedMultiplier
  }

  // 修改更新箭的位置方法
  updateArrows() {
    if (this.state !== GAME_STATE.PLAYING) return

    let survivedArrows = []
    let survivedMonsters = [...this.monsters]

    this.arrows.forEach(arrow => {
      // 更新箭的位置
      arrow.x += arrow.directionX * arrow.speed
      arrow.y += arrow.directionY * arrow.speed

      // 检查箭是否在屏幕范围内
      const margin = 50
      if (arrow.x < -margin || 
          arrow.x > this.screenWidth + margin ||
          arrow.y < -margin || 
          arrow.y > this.screenHeight + margin) {
        return
      }

      let arrowSurvived = true
      survivedMonsters = survivedMonsters.filter(monster => {
        if (!arrowSurvived) return true

        // 调整箭的碰撞区域，使其更准确地匹配箭头部分
        const arrowHitbox = {
          x: arrow.x - arrow.width * 0.1,   // 箭头位置
          y: arrow.y - arrow.height * 0.2,   // 调整碰撞区域位置
          width: arrow.width * 0.2,          // 箭头宽度
          height: arrow.height * 0.3         // 箭头长度
        }

        // 缩小怪物的碰撞区域
        const monsterHitbox = {
          x: monster.x - monster.width * 0.3,
          y: monster.y - monster.height * 0.3,
          width: monster.width * 0.6,     // 碰撞区域为怪物实际大小的60%
          height: monster.height * 0.6
        }

        if (this.checkCollision(arrowHitbox, monsterHitbox)) {
          // 减少怪物血量
          monster.hp -= arrow.damage
          
          // 只有当怪物血量小于等于0时才消灭怪物
          if (monster.hp <= 0) {
            // 在碰撞位置创建爆炸效果
            this.createExplosion(monster.x, monster.y)
            arrowSurvived = false
            this.addExperience()
            return false
          }
          
          // 如果怪物还有血量，箭也会消失，但怪物继续存活
          arrowSurvived = false
          return true
        }
        return true
      })

      if (arrowSurvived) {
        survivedArrows.push(arrow)
      }
    })

    // 更新和清理爆炸效果
    const currentTime = Date.now()
    this.explosions = this.explosions.filter(explosion => 
      currentTime - explosion.createTime < explosion.duration
    )

    this.arrows = survivedArrows
    this.monsters = survivedMonsters
  }

  // 修改生成怪物方法
  spawnMonster() {
    if (this.state !== GAME_STATE.PLAYING) return

    const currentTime = Date.now()
    if (currentTime - this.lastMonsterTime >= this.monsterInterval) {
      // 随机选择生成位置（上、下、左、右四个边）
      const side = Math.floor(Math.random() * 4)
      let x, y
      
      switch(side) {
        case 0: // 上边
          x = Math.random() * this.screenWidth
          y = -32
          break
        case 1: // 右边
          x = this.screenWidth + 32
          y = Math.random() * this.screenHeight
          break
        case 2: // 下边
          x = Math.random() * this.screenWidth
          y = this.screenHeight + 32
          break
        case 3: // 左边
          x = -32
          y = Math.random() * this.screenHeight
          break
      }

      const levelMultiplier = 1 + (this.gameConfig.level - 1) * 0.2  // 每关增加20%
      
      this.monsters.push({
        x: x,
        y: y,
        width: this.gameConfig.monsterBaseStats.width,
        height: this.gameConfig.monsterBaseStats.height,
        speed: this.gameConfig.monsterBaseStats.speed * levelMultiplier,
        hp: Math.ceil(this.gameConfig.monsterBaseStats.hp * levelMultiplier)  // 血量也随关卡提升
      })
      
      this.lastMonsterTime = currentTime
    }
  }

  // 修改更新怪物位置方法，添加碰撞检测
  updateMonsters() {
    if (this.state !== GAME_STATE.PLAYING) return

    this.monsters.forEach(monster => {
      // 计算怪物到玩家的方向
      const dx = this.player.x + this.player.width/2 - monster.x
      const dy = this.player.y + this.player.height/2 - monster.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // 更新怪物位置（标准化方向向量）
      if (distance > 0) {
        monster.x += (dx / distance) * monster.speed
        monster.y += (dy / distance) * monster.speed

        // 检查是否与玩家碰撞
        if (this.checkCollision({
          x: monster.x - monster.width/2,
          y: monster.y - monster.height/2,
          width: monster.width,
          height: monster.height
        }, {
          x: this.player.x,
          y: this.player.y,
          width: this.player.width,
          height: this.player.height
        })) {
          // 发生碰撞，游戏失败
          this.state = GAME_STATE.DEFEAT
          return
        }
      }
    })

    // 移除超出屏幕太远的怪物
    const margin = 100
    this.monsters = this.monsters.filter(monster => 
      monster.x > -margin &&
      monster.x < this.screenWidth + margin &&
      monster.y > -margin &&
      monster.y < this.screenHeight + margin
    )
  }

  // 添加绘制胜利界面方法
  drawVictory() {
    this.drawGame()

    // 添加半透明黑色遮罩
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight)

    // 绘制胜利文字
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = 'bold 48px Arial'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    this.ctx.shadowBlur = 10
    this.ctx.fillText('胜利', this.screenWidth / 2, this.screenHeight / 2 - 50)

    // 显示统计和继续按钮
    this.ctx.font = '24px Arial'
    this.ctx.fillText(
      `第 ${this.gameConfig.level} 关通关！`,
      this.screenWidth / 2,
      this.screenHeight / 2
    )
    this.ctx.fillText(
      `总击杀数: ${this.player.killCount}`,
      this.screenWidth / 2,
      this.screenHeight / 2 + 40
    )

    // 在等待状态前显示倒计时
    if (this.state === GAME_STATE.VICTORY_WAITING) {
      const remainingTime = Math.ceil((3000 - (Date.now() - this.victoryTimer)) / 1000)
      if (remainingTime > 0) {
        this.ctx.fillText(
          `${remainingTime}`,
          this.screenWidth / 2,
          this.screenHeight / 2 + 80
        )
      }
    } else {
      this.ctx.fillText(
        `点击继续进入第 ${this.gameConfig.level + 1} 关`,
        this.screenWidth / 2,
        this.screenHeight / 2 + 80
      )

      // 使用彩色渐变效果绘制"继续"按钮
      const gradient = this.ctx.createLinearGradient(
        this.screenWidth / 2 - 50,
        0,
        this.screenWidth / 2 + 50,
        0
      )
      gradient.addColorStop(0, '#ff0000')
      gradient.addColorStop(0.5, '#ffff00')
      gradient.addColorStop(1, '#00ff00')

      this.ctx.fillStyle = gradient
      this.ctx.font = 'bold 28px Arial'
      this.ctx.fillText(
        '继续',
        this.screenWidth / 2,
        this.screenHeight / 2 + 150
      )
    }
  }

  // 修改绘制失败界面方法，添加倒计时显示
  drawDefeat() {
    this.drawGame()

    // 添加半透明黑色遮罩
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight)

    // 绘制失败文字
    this.ctx.fillStyle = '#ff0000'
    this.ctx.font = 'bold 48px Arial'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.shadowColor = 'rgba(255, 0, 0, 0.5)'
    this.ctx.shadowBlur = 10
    this.ctx.fillText('失败', this.screenWidth / 2, this.screenHeight / 2)

    // 显示统计信息
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = '24px Arial'
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
    this.ctx.fillText(
      `击杀数: ${this.player.killCount}`,
      this.screenWidth / 2,
      this.screenHeight / 2 + 50
    )

    // 在等待状态前显示倒计时
    if (this.state === GAME_STATE.DEFEAT) {
      const remainingTime = Math.ceil((3000 - (Date.now() - this.defeatTimer)) / 1000)
      if (remainingTime > 0) {
        this.ctx.fillText(
          `${remainingTime}`,
          this.screenWidth / 2,
          this.screenHeight / 2 + 100
        )
      }
    }

    // 在等待状态显示重新开始
    if (this.state === GAME_STATE.DEFEAT_WAITING) {
      this.ctx.fillText(
        '重新开始',
        this.screenWidth / 2,
        this.screenHeight / 2 + 100
      )
    }
  }

  // 添加绘制调试边框的辅助方法
  drawDebugRect(x, y, width, height, color = '#ff0000') {
    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 1
    this.ctx.strokeRect(x, y, width, height)
    this.ctx.restore()
  }

  // 修改绘制游戏界面方法，添加调试边框
  drawGame() {
    // 绘制背景
    if (images.bg && images.bg.complete) {
      this.ctx.drawImage(images.bg, 0, 0, this.screenWidth, this.screenHeight)
    }
    
    // 绘制玩家
    if (images.player && images.player.complete) {
      this.ctx.drawImage(
        images.player,
        this.player.x,
        this.player.y,
        this.player.width,
        this.player.height
      )

      // 绘制玩家调试边框
      if (this.debugMode) {
        this.drawDebugRect(
          this.player.x,
          this.player.y,
          this.player.width,
          this.player.height,
          '#00ff00'  // 玩家用绿色边框
        )
      }
    }

    // 绘制怪物
    if (images.monster && images.monster.complete) {
      this.monsters.forEach(monster => {
        // 使用第一个怪物图标（5个图标排列）
        const frameWidth = images.monster.width / 5  // 修改为5等分
        const frameHeight = frameWidth               // 使用正方形区域
        
        // 调整源图片的裁剪位置，确保完整包含第一个图标
        const sourceX = frameWidth * 0.1            // 向左偏移一点
        const sourceY = 0
        const sourceWidth = frameWidth * 1.5        // 从1.2改为1.5，再增加30%的宽度
        
        this.ctx.drawImage(
          images.monster,
          sourceX, sourceY,                  // 调整后的源图片位置
          sourceWidth, frameHeight,          // 调整后的源图片区域
          monster.x - monster.width/2,       // 绘制位置x（居中）
          monster.y - monster.height/2,      // 绘制位置y（居中）
          monster.width,                     // 绘制宽度
          monster.height                     // 绘制高度
        )

        // 绘制血量条
        const healthBarWidth = monster.width
        const healthBarHeight = 4
        const healthPercentage = monster.hp / (this.gameConfig.monsterBaseStats.hp * (1 + (this.gameConfig.level - 1) * 0.2))

        // 绘制血量条背景
        this.ctx.fillStyle = '#ff0000'
        this.ctx.fillRect(
          monster.x - healthBarWidth/2,
          monster.y - monster.height/2 - 10,
          healthBarWidth,
          healthBarHeight
        )

        // 绘制当前血量
        this.ctx.fillStyle = '#00ff00'
        this.ctx.fillRect(
          monster.x - healthBarWidth/2,
          monster.y - monster.height/2 - 10,
          healthBarWidth * healthPercentage,
          healthBarHeight
        )

        // 绘制怪物调试边框
        if (this.debugMode) {
          // 怪物实际边框
          this.drawDebugRect(
            monster.x - monster.width/2,
            monster.y - monster.height/2,
            monster.width,
            monster.height,
            '#ff0000'  // 怪物用红色边框
          )

          // 怪物碰撞区域
          const hitboxWidth = monster.width * 0.6
          const hitboxHeight = monster.height * 0.6
          this.drawDebugRect(
            monster.x - hitboxWidth/2,
            monster.y - hitboxHeight/2,
            hitboxWidth,
            hitboxHeight,
            '#ff00ff'  // 碰撞区域用粉色边框
          )
        }
      })
    }

    // 绘制箭（现在是子弹）
    if (images.arrow && images.arrow.complete) {
      this.arrows.forEach(arrow => {
        this.ctx.save()
        
        // 移动到武器的实际位置
        this.ctx.translate(arrow.x, arrow.y)
        
        // 使用保存的角度进行旋转
        this.ctx.rotate(arrow.angle)
        
        // 使用第一个子弹图标（9个图标排列）
        const frameWidth = images.arrow.width / 9   // 修改为9等分
        const frameHeight = images.arrow.height
        
        // 调整武器的绘制位置和源图片裁剪区域
        this.ctx.drawImage(
          images.arrow,
          frameWidth * 0.2,                    // 向右移动20%
          frameHeight * 0.05,                  // 向上移动，只从5%处开始裁剪
          frameWidth * 2.6, frameHeight * 0.3, // 增加宽度到2.6，减少高度到0.3
          -arrow.width/2,                      // 水平居中
          -arrow.height * 0.3,                 // 调整垂直位置
          arrow.width,                         // 保持绘制宽度
          arrow.height * 0.3                   // 减少绘制高度
        )
        
        this.ctx.restore()

        // 绘制箭的调试边框
        if (this.debugMode) {
          // 箭的实际边框
          this.drawDebugRect(
            arrow.x - arrow.width/2,
            arrow.y - arrow.height/2,
            arrow.width,
            arrow.height,
            '#0000ff'  // 箭用蓝色边框
          )

          // 箭的碰撞区域
          const hitboxWidth = arrow.width * 0.2
          const hitboxHeight = arrow.height * 0.3
          this.drawDebugRect(
            arrow.x - hitboxWidth/2,
            arrow.y - hitboxHeight/2,
            hitboxWidth,
            hitboxHeight,
            '#00ffff'  // 碰撞区域用青色边框
          )
        }
      })
    }

    // 绘制爆炸效果
    if (images.boom && images.boom.complete) {
      this.explosions.forEach(explosion => {
        // 计算爆炸效果的透明度（渐变消失）
        const progress = (Date.now() - explosion.createTime) / explosion.duration
        this.ctx.globalAlpha = 1 - progress

        // 使用第一个爆炸图标（假设是3x3的图片布局）
        const frameWidth = images.boom.width / 3
        const frameHeight = images.boom.height / 3
        
        this.ctx.drawImage(
          images.boom,
          0, 0,                    // 源图片的x, y位置（第一个图标）
          frameWidth, frameHeight, // 源图片的宽度和高度
          explosion.x - explosion.width/2,  // 绘制位置x（居中）
          explosion.y - explosion.height/2, // 绘制位置y（居中）
          explosion.width,         // 绘制宽度
          explosion.height         // 绘制高度
        )
      })
      
      // 重置透明度
      this.ctx.globalAlpha = 1
    }

    // 修改状态显示
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = '16px Arial'
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    this.ctx.fillText(`第 ${this.gameConfig.level} 关`, 10, 20)
    this.ctx.fillText(`击杀数: ${this.player.killCount}/100`, 10, 45)
    this.ctx.fillText(`经验值: ${this.player.exp}`, 10, 70)
    this.ctx.fillText(`攻击速度: ${this.player.arrowSpeedMultiplier.toFixed(1)}x`, 10, 95)
  }

  // 添加玩家初始化方法
  initPlayer() {
    const levelMultiplier = 1 + (this.gameConfig.level - 1) * 0.1  // 每关增加10%
    
    this.player = {
      x: (this.screenWidth - this.gameConfig.playerBaseStats.width) / 2,
      y: (this.screenHeight - this.gameConfig.playerBaseStats.height) / 2,
      width: this.gameConfig.playerBaseStats.width,
      height: this.gameConfig.playerBaseStats.height,
      isDragging: false,
      exp: 0,
      baseArrowInterval: this.gameConfig.playerBaseStats.baseArrowInterval / levelMultiplier,
      arrowSpeedMultiplier: 1,
      killCount: 0
    }
  }

  // 添加重新开始方法
  restartGame() {
    this.gameConfig.level = 1
    this.initPlayer()
    this.arrows = []
    this.monsters = []
    this.state = GAME_STATE.PLAYING
  }

  // 添加下一关方法
  nextLevel() {
    this.gameConfig.level++
    this.initPlayer()
    this.arrows = []
    this.monsters = []
    this.state = GAME_STATE.PLAYING
    this.showLevelMessage()  // 显示关卡提示
  }

  // 添加创建爆炸效果的方法
  createExplosion(x, y) {
    this.explosions.push({
      x: x,
      y: y,
      width: 32,  // 爆炸效果的大小
      height: 32,
      duration: 300,  // 爆炸效果持续时间（毫秒）
      createTime: Date.now()
    })
  }

  // 添加关卡提示方法
  showLevelMessage() {
    // 保存当前游戏状态
    const currentState = this.state
    this.state = 'level_message'

    // 显示关卡提示
    const messageTimer = setTimeout(() => {
      this.state = currentState
    }, 2000)  // 显示2秒

    // 在gameLoop中添加关卡提示的绘制
    this.drawLevelMessage = () => {
      this.drawGame()  // 绘制游戏背景

      // 添加半透明黑色遮罩
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      this.ctx.fillRect(0, 0, this.screenWidth, this.screenHeight)

      // 绘制关卡提示
      this.ctx.fillStyle = '#ffffff'
      this.ctx.font = 'bold 36px Arial'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'middle'
      this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
      this.ctx.shadowBlur = 10
      this.ctx.fillText(
        `第 ${this.gameConfig.level} 关`,
        this.screenWidth / 2,
        this.screenHeight / 2
      )
    }
  }

  // 添加游戏配置加载方法
  loadGameConfig() {
    this.gameConfig = {
      level: 1,                    // 当前关卡
      playerBaseStats: {           // 玩家基础属性
        width: 44,
        height: 44,
        baseArrowInterval: 300     // 从500改为300（0.3秒）
      },
      monsterBaseStats: {          // 怪物基础属性
        width: 32,
        height: 32,
        speed: 1,
        hp: 10                     // 怪物基础血量
      },
      weaponStats: {
        damage: 5,                 // 武器基础伤害
        speed: 15.21,             // 武器基础速度
        width: 13,                // 武器宽度
        height: 13                // 武器高度
      }
    }

    // 添加失败倒计时
    this.defeatTimer = 0
    this.defeatCountdown = 3

    // 添加胜利倒计时
    this.victoryTimer = 0
  }

  // 游戏主循环
  gameLoop() {
    this.ctx.clearRect(0, 0, this.screenWidth, this.screenHeight)
    
    // 确保所有状态都能正确处理
    switch (this.state) {
      case GAME_STATE.TITLE:
        this.drawTitle()
        break
      case GAME_STATE.PLAYING:
        this.shootArrow()
        this.updateArrows()
        this.spawnMonster()
        this.updateMonsters()
        this.drawGame()
        break
      case 'level_message':
        this.drawLevelMessage()
        break
      case GAME_STATE.VICTORY:
      case GAME_STATE.VICTORY_WAITING:
        this.drawVictory()
        if (this.state === GAME_STATE.VICTORY_WAITING && 
            Date.now() - this.victoryTimer >= 3000) {
          this.nextLevel()
        }
        break
      case GAME_STATE.DEFEAT:
        this.drawDefeat()
        if (!this.defeatTimer) {
          this.defeatTimer = Date.now()
        } else if (Date.now() - this.defeatTimer >= 3000) {
          this.state = GAME_STATE.DEFEAT_WAITING
        }
        break
      case GAME_STATE.DEFEAT_WAITING:
        this.drawDefeat()
        break
    }
    
    requestAnimationFrame(() => this.gameLoop())
  }
}

// 启动游戏
new Game()
