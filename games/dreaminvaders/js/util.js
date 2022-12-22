export function clamp(x, min, max)
{
    if (x < min) {
        return min;
    }
    if (x > max) {
        return max;
    }
    return x;
}

export function almostZero(x)
{
    return Math.abs(x) < 0.0001;
}

export function reverseToNewArray(arr)
{
    const newArr = [];
    for (let i = arr.length-1; i >= 0; --i) {
        newArr.push(arr[i]);
    }
    return newArr;
}

export function cubicBezierPoint(ctrlPoints, t)
{
    // (1-t)^3P_0 + 3t(1-t)^2P_1 + 3t^2(1-t)P_2 + t^3P_3
    console.assert(t >= 0 && t <= 1);
    console.assert(ctrlPoints.length == 4);
    const oneMinusT = 1-t;
    const oneMinusTSquared = oneMinusT*oneMinusT;
    const tSquared = t*t;
    const terms = [null,null,null,null];
    terms[0] = vecMul(ctrlPoints[0],   oneMinusTSquared*oneMinusT  );
    terms[1] = vecMul(ctrlPoints[1], 3*oneMinusTSquared          *t);
    terms[2] = vecMul(ctrlPoints[2], 3*oneMinusT                 *tSquared);
    terms[3] = vecMul(ctrlPoints[3],                              tSquared*t);
    const result1 = vecAddTo(terms[0], terms[1]);
    const result2 = vecAddTo(terms[2], terms[3]);

    return vecAdd(result1, result2);
}

/*
 * ##############
 * 2d Vectors
 * ##############
 */

export function vecAlmostZero(v)
{
    return Math.abs(v.x) < 0.0001 && Math.abs(v.y) < 0.0001;
}

// Functions that return a new vector object

export function vec(x = 0, y = 0)
{
    return { x, y };
}

export function vecClone(v)
{
    return { x: v.x, y: v.y };
}

export function vecAdd(v1, v2)
{
    return { x: v1.x + v2.x, y: v1.y + v2.y };
}

export function vecSub(v1, v2)
{
    return { x: v1.x - v2.x, y: v1.y - v2.y };
}

export function vecMul(v, f)
{
    return { x: v.x * f, y: v.y * f };
}

export function vecNorm(v)
{
    const len = vecLen(v);
    if ( almostZero(len) ) {
        console.error("Tried to divide by 0");
        return { x: 0, y: 0 };
    }
    const f = 1/len;
    return { x: v.x * f, y: v.y * f };
}

export function vecTangentRight(v)
{
    return {
        x: v.y,
        y: -v.x
    };
}

export function vecRand()
{
    const v = vec(Math.random()-0.5, Math.random()-0.5);
    return v;
}

export function vecRandDir()
{
    const v = vec(Math.random()-0.5, Math.random()-0.5);
    return vecNormalize(v);
}

// In-place functions, prefer these whenever possible to avoid creating a new object

export function vecClear(v)
{
    v.x = 0;
    v.y = 0;
    return v;
}

export function vecCopyTo(v1, v2)
{
    v1.x = v2.x;
    v1.y = v2.y;
    return v1;
}

export function vecAddTo(v1, v2)
{
    v1.x += v2.x;
    v1.y += v2.y;
    return v1;
}

export function vecSubFrom(v1, v2)
{
    v1.x -= v2.x;
    v1.y -= v2.y;
    return v1;
}

export function vecMulBy(v, f)
{
    v.x *= f;
    v.y *= f;
    return v;
}

export function vecFloor(v)
{

    v.x = Math.floor(v.x);
    v.y = Math.floor(v.y);
    return v;
}

export function vecNormalize(v)
{
    const len = vecLen(v);
    if ( almostZero(len) ) {
        console.error("Tried to divide by 0");
        v.x = 0;
        v.y = 0;
    } else {
        v.x /= len;
        v.y /= len;
    }

    return v;
}

export function vecSetMag(v, mag)
{
    return vecMulBy(vecNormalize(v), mag);
}

export function vecClampMag(v, min, max)
{
    const len = vecLen(v);
    if ( almostZero(len) ) {
        // if min is zero, then just zero and return
        if ( almostZero(min) ) {
            v.x = 0;
            v.y = 0;
            return v;
        }
        console.error("Tried to divide by 0");
        return vecClear(v);
    }
    const clampedLen = clamp(len, min, max);
    return vecMulBy(v, clampedLen/len);
}

export function vecNegate(v)
{
    v.x = -v.x;
    v.y = -v.y;
    return v;
}

export function vecRotateBy(v, a)
{
    const x = v.x*Math.cos(a) - v.y*Math.sin(a);
    const y = v.x*Math.sin(a) + v.y*Math.cos(a);
    v.x = x;
    v.y = y;
    return v;
}

// Vector to scalar and scalar to vector functions

export function vecLen(v)
{
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecDot(v1, v2)
{
    return v1.x * v2.x + v1.y * v2.y;
}

export function vecScalarCross(v1, v2)
{
    return v1.x * v2.y - v1.y * v2.x;
}

export function vecToAngle(v)
{
    return Math.atan2(v.y, v.x);
}

export function vecFromAngle(a)
{
    return {
        x: Math.cos(a),
        y: Math.sin(a)
    }
}

export function getDist(p1, p2)
{
    return vecLen(vecSub(p1, p2));
}