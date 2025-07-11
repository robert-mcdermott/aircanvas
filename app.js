class FingerDrawApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.isDrawing = false;
        this.currentTool = 'brush';
        this.currentShape = null;
        this.brushSize = 5;
        this.brushColor = '#000000';
        this.lastFingerPos = null;
        this.shapeStartPos = null;
        this.isDrawingShape = false;
        this.shapeFillMode = true;
        this.savedCanvas = null;
        this.drawingEnabled = true;
        this.gestureMode = 'point-up';
        this.dwellStartTime = null;
        this.dwellThreshold = 500;
        this.nonDrawingHandEnabled = false;
        this.twoHandControlEnabled = true;
        this.hoveredElement = null;
        this.dwellElement = null;
        this.dwellStartTime = null;
        this.dwellDuration = 1000;
        
        this.hands = null;
        this.camera = null;
        
        this.setupCanvas();
        this.setupToolbox();
        this.initializeCamera();
        this.initializeHandTracking();
    }

    setupCanvas() {
        const resizeCanvas = () => {
            this.canvas.width = this.video.clientWidth;
            this.canvas.height = this.video.clientHeight;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
        };

        window.addEventListener('resize', resizeCanvas);
        
        setTimeout(resizeCanvas, 100);
    }

    setupToolbox() {
        const toolboxToggle = document.getElementById('toolbox-toggle');
        const toolbox = document.getElementById('toolbox');
        
        toolboxToggle.addEventListener('click', () => {
            toolbox.classList.toggle('expanded');
        });

        document.querySelectorAll('.brush-size').forEach(size => {
            size.addEventListener('click', () => {
                document.querySelector('.brush-size.active').classList.remove('active');
                size.classList.add('active');
                this.brushSize = parseInt(size.dataset.size);
            });
        });

        document.querySelectorAll('.color').forEach(color => {
            color.addEventListener('click', () => {
                document.querySelector('.color.active').classList.remove('active');
                color.classList.add('active');
                this.brushColor = color.dataset.color;
            });
        });

        document.querySelectorAll('.shape').forEach(shape => {
            shape.addEventListener('click', () => {
                document.querySelectorAll('.shape').forEach(s => s.classList.remove('active'));
                shape.classList.add('active');
                this.currentShape = shape.dataset.shape;
                this.currentTool = 'shape';
                this.setActiveToolVisual('shape');
            });
        });

        document.getElementById('fill-toggle').addEventListener('click', () => {
            const toggle = document.getElementById('fill-toggle');
            this.shapeFillMode = !this.shapeFillMode;
            
            if (this.shapeFillMode) {
                toggle.textContent = '🎨 Fill';
                toggle.classList.add('active');
            } else {
                toggle.textContent = '⭕ Outline';
                toggle.classList.remove('active');
            }
        });

        document.getElementById('drawing-toggle').addEventListener('click', () => {
            const toggle = document.getElementById('drawing-toggle');
            this.drawingEnabled = !this.drawingEnabled;
            
            if (this.drawingEnabled) {
                toggle.textContent = '✏️ ON';
                toggle.classList.add('active');
            } else {
                toggle.textContent = '✏️ OFF';
                toggle.classList.remove('active');
            }
        });

        document.getElementById('two-hand-toggle').addEventListener('click', () => {
            const toggle = document.getElementById('two-hand-toggle');
            this.twoHandControlEnabled = !this.twoHandControlEnabled;
            
            if (this.twoHandControlEnabled) {
                toggle.textContent = '🤝 ON';
                toggle.classList.add('active');
            } else {
                toggle.textContent = '🤝 OFF';
                toggle.classList.remove('active');
            }
        });

        document.querySelectorAll('.gesture-mode').forEach(mode => {
            mode.addEventListener('click', () => {
                document.querySelectorAll('.gesture-mode').forEach(m => m.classList.remove('active'));
                mode.classList.add('active');
                this.gestureMode = mode.dataset.mode;
                this.dwellStartTime = null;
            });
        });

        document.getElementById('brush-tool').addEventListener('click', () => {
            this.setActiveTool('brush-tool');
            this.currentTool = 'brush';
            this.currentShape = null;
            this.clearShapeSelection();
        });

        document.getElementById('eraser-tool').addEventListener('click', () => {
            this.setActiveTool('eraser-tool');
            this.currentTool = 'eraser';
            this.currentShape = null;
            this.clearShapeSelection();
        });

        document.getElementById('clear-tool').addEventListener('click', () => {
            this.clearCanvas();
        });
    }

    setActiveTool(toolId) {
        document.querySelectorAll('.tool').forEach(tool => {
            tool.classList.remove('active');
        });
        if (toolId) {
            document.getElementById(toolId).classList.add('active');
        }
    }

    setActiveToolVisual(toolType) {
        document.querySelectorAll('.tool').forEach(tool => {
            tool.classList.remove('active');
        });
    }

    clearShapeSelection() {
        document.querySelectorAll('.shape').forEach(shape => {
            shape.classList.remove('active');
        });
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    async initializeCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            
            this.video.addEventListener('loadedmetadata', () => {
                this.setupCanvas();
            });
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Camera access is required for this application to work.');
        }
    }

    initializeHandTracking() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => {
            this.processHandResults(results);
        });

        this.camera = new Camera(this.video, {
            onFrame: async () => {
                await this.hands.send({ image: this.video });
            },
            width: 1280,
            height: 720
        });

        this.camera.start();
    }

    processHandResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const { drawingHand, nonDrawingHand } = this.identifyHands(results);
            
            if (!drawingHand) {
                this.hideFingerIndicator();
                this.stopDrawing();
                return;
            }
            
            const landmarks = drawingHand;
            const indexFingerTip = landmarks[8];
            
            const x = (1 - indexFingerTip.x) * this.canvas.width;
            const y = indexFingerTip.y * this.canvas.height;
            
            const isDrawingGesture = this.detectDrawingGesture(landmarks);
            const isNonDrawingHandReady = this.checkNonDrawingHand(nonDrawingHand);
            
            // Update the status for visual feedback
            this.nonDrawingHandEnabled = isNonDrawingHandReady;
            
            this.updateFingerIndicator(x, y);
            
            const canDraw = isDrawingGesture && this.currentTool !== 'clear' && this.drawingEnabled && isNonDrawingHandReady;
            
            if (canDraw) {
                if (this.currentTool === 'shape') {
                    if (!this.isDrawingShape) {
                        this.startShape(x, y);
                    } else {
                        this.updateShape(x, y);
                    }
                } else {
                    if (!this.isDrawing) {
                        this.startDrawing(x, y);
                    } else {
                        this.continuDrawing(x, y);
                    }
                }
            } else {
                if (this.isDrawingShape) {
                    this.finishShape(x, y);
                } else {
                    this.stopDrawing();
                }
            }
            
            this.checkToolboxInteraction(x, y, canDraw);
        } else {
            this.nonDrawingHandEnabled = false;
            this.hideFingerIndicator();
            this.stopDrawing();
        }
    }

    calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    detectDrawingGesture(landmarks) {
        switch (this.gestureMode) {
            case 'point-up':
                return this.isIndexFingerPointingUp(landmarks[8], landmarks[6], landmarks[5]);
            case 'fist-index':
                return this.isFistWithIndexExtended(landmarks);
            case 'pinch':
                return this.isPinchGesture(landmarks);
            case 'peace':
                return this.isPeaceSignGesture(landmarks);
            case 'dwell':
                return this.isDwellGesture(landmarks);
            default:
                return false;
        }
    }

    isIndexFingerPointingUp(tip, pip, mcp) {
        const tipToPip = tip.y - pip.y;
        const pipToMcp = pip.y - mcp.y;
        const isExtendedUp = tipToPip < -0.02 && pipToMcp < -0.01;
        const horizontalDistance = Math.abs(tip.x - mcp.x);
        const verticalDistance = Math.abs(tip.y - mcp.y);
        const isVertical = verticalDistance > horizontalDistance * 0.8;
        return isExtendedUp && isVertical;
    }

    isFistWithIndexExtended(landmarks) {
        // Check if index finger is extended
        const indexExtended = this.isFingerExtended(landmarks, 8, 6, 5);
        
        // Check if other fingers are folded (middle, ring, pinky)
        const middleFolded = !this.isFingerExtended(landmarks, 12, 10, 9);
        const ringFolded = !this.isFingerExtended(landmarks, 16, 14, 13);
        const pinkyFolded = !this.isFingerExtended(landmarks, 20, 18, 17);
        
        return indexExtended && middleFolded && ringFolded && pinkyFolded;
    }

    isPinchGesture(landmarks) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const distance = this.calculateDistance(thumbTip, indexTip);
        
        // More refined pinch control - closer = draw
        return distance < 0.08;
    }

    isPeaceSignGesture(landmarks) {
        // Check if index and middle fingers are extended, others folded
        const indexExtended = this.isFingerExtended(landmarks, 8, 6, 5);
        const middleExtended = this.isFingerExtended(landmarks, 12, 10, 9);
        const ringFolded = !this.isFingerExtended(landmarks, 16, 14, 13);
        const pinkyFolded = !this.isFingerExtended(landmarks, 20, 18, 17);
        
        return indexExtended && middleExtended && ringFolded && pinkyFolded;
    }

    isDwellGesture(landmarks) {
        const indexTip = landmarks[8];
        const currentTime = Date.now();
        
        // Check if index finger is pointing (basic pointing detection)
        const isPointing = this.isFingerExtended(landmarks, 8, 6, 5);
        
        if (!isPointing) {
            this.dwellStartTime = null;
            return false;
        }
        
        // If we're pointing but haven't started dwelling, start timer
        if (this.dwellStartTime === null) {
            this.dwellStartTime = currentTime;
            return false;
        }
        
        // Check if we've been dwelling long enough
        return (currentTime - this.dwellStartTime) > this.dwellThreshold;
    }

    isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];
        const mcp = landmarks[mcpIdx];
        
        // Check if tip is farther from wrist than pip and mcp
        const wrist = landmarks[0];
        const tipDistance = this.calculateDistance(tip, wrist);
        const pipDistance = this.calculateDistance(pip, wrist);
        
        return tipDistance > pipDistance * 1.1;
    }

    identifyHands(results) {
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            return { drawingHand: null, nonDrawingHand: null };
        }
        
        if (results.multiHandLandmarks.length === 1) {
            return { drawingHand: results.multiHandLandmarks[0], nonDrawingHand: null };
        }
        
        // With two hands, determine which is drawing hand (typically right hand)
        // For now, use the hand with extended index finger as drawing hand
        const hand1 = results.multiHandLandmarks[0];
        const hand2 = results.multiHandLandmarks[1];
        
        const hand1IndexExtended = this.isFingerExtended(hand1, 8, 6, 5);
        const hand2IndexExtended = this.isFingerExtended(hand2, 8, 6, 5);
        
        if (hand1IndexExtended && !hand2IndexExtended) {
            return { drawingHand: hand1, nonDrawingHand: hand2 };
        } else if (hand2IndexExtended && !hand1IndexExtended) {
            return { drawingHand: hand2, nonDrawingHand: hand1 };
        } else {
            // Default: use rightmost hand as drawing hand (assumes right-handed)
            const hand1X = hand1[8].x; // Index finger tip X
            const hand2X = hand2[8].x;
            
            if (hand1X < hand2X) { // Lower X = more to the right in mirrored video
                return { drawingHand: hand1, nonDrawingHand: hand2 };
            } else {
                return { drawingHand: hand2, nonDrawingHand: hand1 };
            }
        }
    }

    checkNonDrawingHand(nonDrawingHand) {
        if (!this.twoHandControlEnabled) {
            return true; // Allow drawing if two-hand control is disabled
        }
        
        if (!nonDrawingHand) {
            return false; // Require non-drawing hand when two-hand control is enabled
        }
        
        return this.isHandInFist(nonDrawingHand);
    }

    isHandInFist(landmarks) {
        // Check if all fingers are folded (fist position)
        const indexFolded = !this.isFingerExtended(landmarks, 8, 6, 5);
        const middleFolded = !this.isFingerExtended(landmarks, 12, 10, 9);
        const ringFolded = !this.isFingerExtended(landmarks, 16, 14, 13);
        const pinkyFolded = !this.isFingerExtended(landmarks, 20, 18, 17);
        
        return indexFolded && middleFolded && ringFolded && pinkyFolded;
    }

    isIndexFingerExtended(landmarks) {
        return this.isFingerExtended(landmarks, 8, 6, 5);
    }

    updateFingerIndicator(x, y) {
        let indicator = document.querySelector('.finger-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'finger-indicator';
            document.body.appendChild(indicator);
        }
        
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y}px`;
        indicator.style.display = 'block';
        
        // Simple color feedback: Green = can draw, Red = cannot draw
        const canDraw = this.drawingEnabled && this.nonDrawingHandEnabled;
        indicator.style.borderColor = canDraw ? '#00ff00' : '#ff0000';
    }

    hideFingerIndicator() {
        const indicator = document.querySelector('.finger-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    startDrawing(x, y) {
        this.isDrawing = true;
        this.lastFingerPos = { x, y };
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        
        if (this.currentTool === 'brush') {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.brushColor;
        } else if (this.currentTool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
        }
        
        this.ctx.lineWidth = this.brushSize;
    }

    continuDrawing(x, y) {
        if (!this.isDrawing || !this.lastFingerPos) return;
        
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.lastFingerPos = { x, y };
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.lastFingerPos = null;
            this.ctx.beginPath();
        }
    }

    checkToolboxInteraction(x, y, isDrawingGesture) {
        const toolbox = document.getElementById('toolbox');
        const toolboxRect = toolbox.getBoundingClientRect();
        
        if (x >= toolboxRect.left && x <= toolboxRect.right &&
            y >= toolboxRect.top && y <= toolboxRect.bottom) {
            
            // Handle toolbox toggle
            const toggle = document.getElementById('toolbox-toggle');
            const toggleRect = toggle.getBoundingClientRect();
            
            if (x >= toggleRect.left && x <= toggleRect.right &&
                y >= toggleRect.top && y <= toggleRect.bottom) {
                this.handleElementProximity(toggle, isDrawingGesture);
            } else if (toolbox.classList.contains('expanded')) {
                this.handleToolboxElementProximity(x, y, isDrawingGesture);
            }
        } else {
            this.clearElementStates();
        }
    }

    handleToolboxElementProximity(x, y, isDrawingGesture) {
        const elements = [
            ...document.querySelectorAll('.brush-size'),
            ...document.querySelectorAll('.color'),
            ...document.querySelectorAll('.tool'),
            ...document.querySelectorAll('.shape'),
            ...document.querySelectorAll('.gesture-mode'),
            document.getElementById('fill-toggle'),
            document.getElementById('drawing-toggle'),
            document.getElementById('two-hand-toggle')
        ];
        
        let foundHoveredElement = null;
        
        elements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const padding = 20; // Expand hit area
            
            if (x >= rect.left - padding && x <= rect.right + padding &&
                y >= rect.top - padding && y <= rect.bottom + padding) {
                foundHoveredElement = element;
            }
        });
        
        if (foundHoveredElement) {
            this.handleElementProximity(foundHoveredElement, isDrawingGesture);
        } else {
            this.clearElementStates();
        }
    }

    handleElementProximity(element, isDrawingGesture) {
        // Clear previous states if switching elements
        if (this.hoveredElement && this.hoveredElement !== element) {
            this.clearElementStates();
        }
        
        // Set hover state
        if (this.hoveredElement !== element) {
            this.hoveredElement = element;
            element.classList.add('toolbox-item-hover');
        }
        
        // Handle dwell selection
        if (isDrawingGesture) {
            if (this.dwellElement !== element) {
                this.dwellElement = element;
                this.dwellStartTime = Date.now();
                element.classList.add('toolbox-item-dwell');
                
                // Add progress indicator
                const progress = document.createElement('div');
                progress.className = 'dwell-progress';
                element.style.position = 'relative';
                element.appendChild(progress);
                
                // Auto-remove progress after animation
                setTimeout(() => {
                    if (progress.parentNode) {
                        progress.remove();
                    }
                }, this.dwellDuration);
            }
            
            // Check if dwell time completed
            if (Date.now() - this.dwellStartTime >= this.dwellDuration) {
                element.click();
                this.clearElementStates();
                
                // Visual feedback for successful selection
                element.style.transform = 'scale(1.3)';
                element.style.transition = 'transform 0.2s ease';
                setTimeout(() => {
                    element.style.transform = '';
                    element.style.transition = '';
                }, 200);
            }
        } else {
            // Clear dwell if not drawing gesture
            if (this.dwellElement === element) {
                element.classList.remove('toolbox-item-dwell');
                const progress = element.querySelector('.dwell-progress');
                if (progress) progress.remove();
                this.dwellElement = null;
                this.dwellStartTime = null;
            }
        }
    }

    clearElementStates() {
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove('toolbox-item-hover');
            this.hoveredElement = null;
        }
        
        if (this.dwellElement) {
            this.dwellElement.classList.remove('toolbox-item-dwell');
            const progress = this.dwellElement.querySelector('.dwell-progress');
            if (progress) progress.remove();
            this.dwellElement = null;
            this.dwellStartTime = null;
        }
    }

    startShape(x, y) {
        this.isDrawingShape = true;
        this.shapeStartPos = { x, y };
        this.saveCanvasState();
    }

    saveCanvasState() {
        this.savedCanvas = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    restoreCanvasState() {
        if (this.savedCanvas) {
            this.ctx.putImageData(this.savedCanvas, 0, 0);
        }
    }

    updateShape(x, y) {
        if (!this.isDrawingShape || !this.shapeStartPos) return;
        
        this.restoreCanvasState();
        this.drawShapePreview(this.shapeStartPos.x, this.shapeStartPos.y, x, y);
    }

    finishShape(x, y) {
        if (!this.isDrawingShape || !this.shapeStartPos) return;
        
        this.drawShape(this.shapeStartPos.x, this.shapeStartPos.y, x, y);
        this.isDrawingShape = false;
        this.shapeStartPos = null;
    }

    drawShapePreview(startX, startY, endX, endY) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.5;
        this.ctx.setLineDash([5, 5]);
        this.drawShapeInternal(startX, startY, endX, endY);
        this.ctx.restore();
    }

    drawShape(startX, startY, endX, endY) {
        this.drawShapeInternal(startX, startY, endX, endY);
    }

    drawShapeInternal(startX, startY, endX, endY) {
        this.ctx.fillStyle = this.brushColor;
        this.ctx.strokeStyle = this.brushColor;
        this.ctx.lineWidth = this.brushSize;
        
        const width = endX - startX;
        const height = endY - startY;
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        
        this.ctx.beginPath();
        
        switch (this.currentShape) {
            case 'square':
                const size = Math.min(Math.abs(width), Math.abs(height));
                this.ctx.rect(centerX - size/2, centerY - size/2, size, size);
                break;
                
            case 'rectangle':
                this.ctx.rect(startX, startY, width, height);
                break;
                
            case 'circle':
                const radius = Math.min(Math.abs(width), Math.abs(height)) / 2;
                this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                break;
                
            case 'ellipse':
                const radiusX = Math.abs(width) / 2;
                const radiusY = Math.abs(height) / 2;
                this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                break;
                
            case 'triangle':
                this.ctx.moveTo(centerX, startY);
                this.ctx.lineTo(startX, endY);
                this.ctx.lineTo(endX, endY);
                this.ctx.closePath();
                break;
                
            case 'line':
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                break;
        }
        
        if (this.currentShape === 'line') {
            this.ctx.stroke();
        } else {
            if (this.shapeFillMode) {
                this.ctx.fill();
            } else {
                this.ctx.stroke();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FingerDrawApp();
});