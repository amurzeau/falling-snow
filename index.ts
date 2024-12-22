
class Particule {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    velocity: number;
};

function writePixel(image: ImageData, x: number, y: number, pixel: number) {
    let data = image.data;
    let offset = (x * image.width + y) * 4;
    data[offset] = pixel & 0xFF;
    data[offset + 1] = (pixel >> 8) & 0xFF;
    data[offset + 2] = (pixel >> 16) & 0xFF;
    data[offset + 3] = (pixel >> 24) & 0xFF;
}

function readPixel(image: ImageData, x: number, y: number) {
    let pixel: number = 0;
    let data = image.data;
    let offset = (x * image.width + y) * 4;
    pixel |= data[offset];
    pixel |= data[offset + 1] << 8;
    pixel |= data[offset + 2] << 16;
    pixel |= data[offset + 3] << 24;
    return pixel;
}

function CopyLargeImagetoSmall(dst: ImageData, src: ImageData, xDst: number, yDst: number) {
    let x = 0;
    let xsize = src.height;
    let ysize = src.width;
    let x_max = xsize;
    let y_max = ysize;

    if (ysize + yDst > dst.width)
        y_max = dst.width - yDst;

    if (xsize + xDst > dst.height)
        x_max = dst.height - xDst;

    if (xDst < 0)
        x = xDst;
    for (; x < x_max; x++) {
        let y = 0;
        if (yDst < 0)
            y = -yDst;
        for (; y < y_max; y++) {
            let color = readPixel(src, x, y);
            if ((color & 0xFF000000) != 0) {
                writePixel(dst, x + xDst, y + yDst, color);
            }
        }
    }
}

function addImageProcess(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        let img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
    })
}

async function getImageData(image: string): Promise<ImageData> {
    var canvas = document.createElement('canvas');
    var ctx: CanvasRenderingContext2D = canvas.getContext('2d') as CanvasRenderingContext2D;

    // 2) Copy your image data into the canvas
    var img = await addImageProcess(image);

    // 3) Read your image data
    var w = img.width, h = img.height;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, w, h);
}

(async () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas)
        return;

    const ctx: CanvasRenderingContext2D = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

    ctx.canvas.width  = window.innerWidth;
    ctx.canvas.height = window.innerHeight;

    const Image = ctx.createImageData(canvas.width, canvas.height);
    const hauteur_manteau_neigeux = new Array(240);
    const hauteur_sol = new Array(240);
    const VELOCITY_MOYEN = 1
    const particules_lente: Array<Particule> = new Array();
    const particules_moyenne: Array<Particule> = new Array();
    const particules_rapide: Array<Particule> = new Array();
    let traineau_pos_y = 200;
    const LCD_COLOR_WHITE = 0xFFFFFFFF;
    const LCD_COLOR_BLACK = 0xFF000000;

    const CANVAS_WIDTH = Image.width;
    const CANVAS_HEIGHT = Image.height;

    let maison_image: ImageData = await getImageData("maison.png");
    let sapin_image: ImageData = await getImageData("sapin.png");
    let traineau_image: ImageData = await getImageData("traineau.png");

    function initParticules(particules: Array<Particule>, count: number, velocity: number) {
        for (let i = 0; i < count; i++) {
            particules.push({
                x: Math.trunc(Math.random() * CANVAS_HEIGHT),
                y: Math.trunc(Math.random() * CANVAS_WIDTH),
                prevX: 0,
                prevY: 0,
                velocity: velocity
            });
        }
    }

    function drawNeige(x: number, y: number, color: number, taille: number) {
        x = Math.trunc(x);
        y = Math.trunc(y);
        for (let i = x - taille; i < x + taille + 1; i++) {
            for (let j = y - taille; j < y + taille + 1; j++) {
                if (i > 0 && i < CANVAS_HEIGHT && j > 0 && j < CANVAS_WIDTH && (i - x == j - y || i - x == y - j || i == x || j == y)) {
                    writePixel(Image, i, j, color);
                }
            }
        }
    }

    function propagateManteauNeigeux(y: number) {
        let seuil_sol = 10;
        if (hauteur_sol[y] < CANVAS_HEIGHT) {
            seuil_sol = 5;
        }

        if (hauteur_manteau_neigeux[y] > hauteur_sol[y] - seuil_sol) {
            // Nivellation
            if (y > 0 && hauteur_manteau_neigeux[y] < hauteur_manteau_neigeux[y - 1] - 1) {
                propagateManteauNeigeux(y - 1);
            } else if (y < CANVAS_WIDTH - 1 && hauteur_manteau_neigeux[y] < hauteur_manteau_neigeux[y + 1] - 1) {
                propagateManteauNeigeux(y + 1);
            }
            else
                hauteur_manteau_neigeux[y]--;
        } else {
            while (1) {
                let y_remove_neige = Math.trunc(Math.random() * CANVAS_WIDTH);
                if (hauteur_manteau_neigeux[y_remove_neige] < hauteur_sol[y_remove_neige]) {
                    hauteur_manteau_neigeux[y_remove_neige]++;
                    break;
                }
            }
        }
    }

    CopyLargeImagetoSmall(Image, sapin_image, CANVAS_HEIGHT-sapin_image.height, 102);
    CopyLargeImagetoSmall(Image, maison_image, CANVAS_HEIGHT-maison_image.height, 14);

    for (let i = 0; i < hauteur_manteau_neigeux.length; i++) {
        hauteur_manteau_neigeux[i] = CANVAS_HEIGHT;
        // Check bottom
        for (let j = 0; j < CANVAS_HEIGHT; j++) {
            if ((readPixel(Image, j, i) & 0xFFFFFF) != 0) {
                hauteur_manteau_neigeux[i] = j;
                break;
            }
        }
        hauteur_sol[i] = hauteur_manteau_neigeux[i];
    }

    initParticules(particules_lente, 100, VELOCITY_MOYEN * 0.5);
    initParticules(particules_moyenne, 60, VELOCITY_MOYEN);
    initParticules(particules_rapide, 20, VELOCITY_MOYEN * 2.0);

    let frameCount = 0;
    let fpsElement: HTMLDivElement = document.getElementById('fps') as HTMLDivElement;
    setInterval(function () {
        let count = frameCount;
        frameCount = 0;
        fpsElement.textContent = "FPS: " + count;
    }, 1000);

    function updateAnimation(timestamp: DOMHighResTimeStamp) {
        frameCount++;
        for(let i=0; i< Image.data.length; i+=1) {
            Image.data[i] = 0;
        }

        for (let particule of particules_lente) {
            if (particule.x < 0 || particule.x >= CANVAS_HEIGHT || particule.y < 0 || particule.y >= CANVAS_WIDTH) {
                particule.x = 0;
                particule.y = Math.trunc(Math.random() * CANVAS_WIDTH);
            }
            particule.prevX = particule.x;
            particule.prevY = particule.y;
            drawNeige(particule.x, particule.y, LCD_COLOR_WHITE, 0);
            particule.x += particule.velocity;
        }

        CopyLargeImagetoSmall(Image, traineau_image, 100, traineau_pos_y);

        traineau_pos_y -= 1;
        if (traineau_pos_y < -200)
            traineau_pos_y = 2000;


        for (let particule of particules_moyenne) {
            if (particule.velocity > VELOCITY_MOYEN / 2.0 && (particule.x < 0 || particule.x >= hauteur_manteau_neigeux[Math.trunc(particule.y)] || particule.y < 0 || particule.y >= CANVAS_WIDTH)) {
                particule.velocity = VELOCITY_MOYEN / 4.0;

                propagateManteauNeigeux(particule.y);
            }
        }

        for (let y = 0; y < hauteur_manteau_neigeux.length; y++) {
            for (let x = hauteur_manteau_neigeux[y]; x < hauteur_sol[y]; x++) {
                writePixel(Image, x, y, LCD_COLOR_WHITE);
            }
        }

        CopyLargeImagetoSmall(Image, sapin_image, CANVAS_HEIGHT-sapin_image.height, 102);
        CopyLargeImagetoSmall(Image, maison_image, CANVAS_HEIGHT-maison_image.height, 14);

        for (let particule of particules_moyenne) {
            if (particule.x < 0 || particule.x >= hauteur_sol[Math.trunc(particule.y)] + 1 || particule.y < 0 || particule.y >= CANVAS_WIDTH) {
                particule.x = 0;
                particule.y = Math.trunc(Math.random() * CANVAS_WIDTH);
                particule.velocity = VELOCITY_MOYEN;
            }
            particule.prevX = particule.x;
            particule.prevY = particule.y;
            drawNeige(particule.x, particule.y, LCD_COLOR_WHITE, 1);
            particule.x += particule.velocity;
        }


        for (let particule of particules_rapide) {
            if (particule.x < 0 || particule.x >= CANVAS_HEIGHT || particule.y < 0 || particule.y >= CANVAS_WIDTH) {
                particule.x = 0;
                particule.y = Math.trunc(Math.random() * CANVAS_WIDTH);
            }
            particule.prevX = particule.x;
            particule.prevY = particule.y;
            drawNeige(particule.x, particule.y, LCD_COLOR_WHITE, 4);
            particule.x += particule.velocity;
        }
        ctx.putImageData(Image, 0, 0);
        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
})();
